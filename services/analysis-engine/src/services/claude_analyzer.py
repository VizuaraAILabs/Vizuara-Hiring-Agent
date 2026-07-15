from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import socket

from google import genai
from google.genai import types

from ..models.schemas import AnalysisResponse
from ..prompts.dimension_rubrics import DIMENSION_RUBRICS
from ..prompts.system_prompt import SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class AnalysisTimeoutError(TimeoutError):
    """Raised when analysis work exceeds a configured Gemini deadline."""

    def __init__(
        self,
        message: str,
        *,
        phase: str | None = None,
        timeout_ms: int | None = None,
        model: str | None = None,
    ) -> None:
        super().__init__(message)
        self.phase = phase
        self.timeout_ms = timeout_ms
        self.model = model


def _env_int(name: str, default: int, minimum: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        return max(minimum, int(raw_value))
    except ValueError:
        logger.warning("Invalid %s=%r; defaulting to %d", name, raw_value, default)
        return default


_TRANSCRIPT_CHUNK_THRESHOLD_CHARS = _env_int(
    "ANALYSIS_CHUNK_TRANSCRIPT_CHARS",
    default=160_000,
    minimum=40_000,
)
_TRANSCRIPT_CHUNK_TARGET_CHARS = _env_int(
    "ANALYSIS_CHUNK_TARGET_CHARS",
    default=100_000,
    minimum=20_000,
)
_MAX_PASS1_CHUNKS = _env_int(
    "ANALYSIS_MAX_PASS1_CHUNKS",
    default=12,
    minimum=2,
)
_MAX_CANDIDATE_ACTIONS_FOR_SCORING = _env_int(
    "ANALYSIS_MAX_CANDIDATE_ACTIONS_FOR_SCORING",
    default=250,
    minimum=50,
)
_MAX_AI_OBSERVATIONS_FOR_SCORING = _env_int(
    "ANALYSIS_MAX_AI_OBSERVATIONS_FOR_SCORING",
    default=300,
    minimum=50,
)
_MAX_SCORING_OBSERVATIONS_CHARS = _env_int(
    "ANALYSIS_MAX_SCORING_OBSERVATIONS_CHARS",
    default=120_000,
    minimum=20_000,
)
_SEGMENT_HEADER_RE = re.compile(r"(?m)^--- \[[^\]\n]+\].*? ---\s*$")


def is_timeout_exception(exc: BaseException) -> bool:
    """Return true for stdlib, asyncio, and HTTP-client timeout exceptions."""
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(
            current,
            (AnalysisTimeoutError, TimeoutError, asyncio.TimeoutError, socket.timeout),
        ):
            return True

        class_name = current.__class__.__name__.lower()
        module_name = current.__class__.__module__.lower()
        if "timeout" in class_name and (
            module_name.startswith("httpx")
            or module_name.startswith("httpcore")
            or module_name.startswith("aiohttp")
            or module_name.startswith("google")
        ):
            return True

        current = current.__cause__ or current.__context__

    return False

# ---------------------------------------------------------------------------
# Pass 1 schema: extract factual observations from the transcript
# ---------------------------------------------------------------------------
_OBSERVATION_SCHEMA = {
    "type": "object",
    "properties": {
        "candidate_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "segment_ref": {"type": "string", "description": "Transcript segment reference, e.g. '#5'"},
                    "timestamp": {"type": "string", "description": "Timestamp from the segment header"},
                    "action_type": {
                        "type": "string",
                        "enum": ["command", "prompt", "code_edit", "navigation", "testing", "other"],
                    },
                    "description": {"type": "string", "description": "What the candidate did"},
                    "verbatim_quote": {"type": "string", "description": "Near-verbatim quote of what the candidate typed"},
                },
                "required": ["segment_ref", "action_type", "description", "verbatim_quote"],
            },
            "description": "Every distinct action the candidate took, in chronological order",
        },
        "ai_interactions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "segment_ref": {"type": "string"},
                    "summary": {"type": "string", "description": "Brief summary of what the AI responded or did"},
                },
                "required": ["segment_ref", "summary"],
            },
            "description": "Summary of each AI response or output",
        },
        "session_summary": {
            "type": "object",
            "properties": {
                "total_candidate_actions": {"type": "integer"},
                "session_duration_estimate_minutes": {"type": "number"},
                "tools_used": {"type": "array", "items": {"type": "string"}},
                "problem_solving_attempted": {"type": "boolean"},
                "bugs_identified": {"type": "integer"},
                "bugs_fixed": {"type": "integer"},
                "tests_run": {"type": "boolean"},
                "code_written_or_modified": {"type": "boolean"},
            },
            "required": [
                "total_candidate_actions", "session_duration_estimate_minutes",
                "tools_used", "problem_solving_attempted",
                "bugs_identified", "bugs_fixed",
                "tests_run", "code_written_or_modified",
            ],
        },
    },
    "required": ["candidate_actions", "ai_interactions", "session_summary"],
}

# ---------------------------------------------------------------------------
# Pass 2 schema: score based on the extracted observations
# ---------------------------------------------------------------------------
_DIMENSION_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "number", "description": "Score from 0 to 100"},
        "narrative": {"type": "string", "description": "Qualitative explanation for this score"},
        "evidence": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Specific evidence from the observations supporting this score",
        },
        "observed_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "transcript_quote": {
                        "type": "string",
                        "description": "Near-verbatim quote of what the candidate typed or did, taken directly from the transcript",
                    },
                    "observation": {
                        "type": "string",
                        "description": "What this specific action reveals about the candidate's ability on this dimension",
                    },
                    "comparison": {
                        "type": "string",
                        "description": "How this compares to what would be expected of a strong candidate for this specific role and challenge — grounded in the provided role, stack, and difficulty level, not a generic senior-engineer bar",
                    },
                },
                "required": ["transcript_quote", "observation", "comparison"],
            },
            "description": "Transcript-grounded evidence points for this dimension. Include one entry per meaningful candidate action relevant to this dimension (aim for 2-5 points minimum where evidence exists).",
        },
        "expected_standard": {
            "type": "string",
            "description": "2-4 sentences describing what a strong, well-prepared candidate for THIS specific role and challenge would ideally do on this dimension. Use the provided role and tech stack to calibrate the bar — do NOT default to 'senior engineer at 100' and do NOT infer the role or stack from the description when they have been explicitly provided.",
        },
    },
    "required": ["score", "narrative", "evidence", "observed_points", "expected_standard"],
}

_SCORING_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_score": {"type": "number", "description": "Overall score 0-100"},
        "dimensions": {
            "type": "object",
            "properties": {
                "problem_decomposition": _DIMENSION_SCHEMA,
                "first_principles": _DIMENSION_SCHEMA,
                "creativity": _DIMENSION_SCHEMA,
                "iteration_quality": _DIMENSION_SCHEMA,
                "debugging_approach": _DIMENSION_SCHEMA,
                "architecture_thinking": _DIMENSION_SCHEMA,
                "communication_clarity": _DIMENSION_SCHEMA,
                "efficiency": _DIMENSION_SCHEMA,
            },
            "required": [
                "problem_decomposition", "first_principles", "creativity",
                "iteration_quality", "debugging_approach", "architecture_thinking",
                "communication_clarity", "efficiency",
            ],
        },
        "key_moments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "timestamp": {"type": "string"},
                    "type": {"type": "string", "enum": ["strength", "weakness", "pivot", "insight"]},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "interaction_index": {"type": "integer"},
                },
                "required": ["timestamp", "type", "title", "description"],
            },
        },
        "timeline_data": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start_time": {"type": "number"},
                    "end_time": {"type": "number"},
                    "activity": {"type": "string"},
                    "category": {"type": "string", "enum": ["planning", "coding", "debugging", "prompting", "reviewing"]},
                },
                "required": ["start_time", "end_time", "activity", "category"],
            },
        },
        "prompt_complexity": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sequence": {"type": "integer"},
                    "complexity": {"type": "number"},
                    "label": {"type": "string"},
                },
                "required": ["sequence", "complexity", "label"],
            },
        },
        "category_breakdown": {
            "type": "object",
            "properties": {
                "planning": {"type": "number"},
                "coding": {"type": "number"},
                "debugging": {"type": "number"},
                "prompting": {"type": "number"},
                "reviewing": {"type": "number"},
            },
            "required": ["planning", "coding", "debugging", "prompting", "reviewing"],
        },
        "summary_narrative": {"type": "string", "description": "2-3 paragraph overall summary"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "areas_for_growth": {"type": "array", "items": {"type": "string"}},
        "hiring_recommendation": {
            "type": "string",
            "enum": ["strong_yes", "yes", "neutral", "no", "strong_no"],
        },
    },
    "required": [
        "overall_score", "dimensions", "key_moments", "timeline_data",
        "prompt_complexity", "category_breakdown", "summary_narrative",
        "strengths", "areas_for_growth", "hiring_recommendation",
    ],
}


class ClaudeAnalyzer:
    """Sends the parsed transcript to Gemini for evaluation using a two-pass
    approach to minimize hallucination."""

    MODEL = "gemini-2.5-flash"
    MAX_RETRIES = 2

    def __init__(self) -> None:
        self.api_keys = self._load_api_keys()
        self.request_timeout_ms = _env_int(
            "GEMINI_REQUEST_TIMEOUT_MS",
            default=60_000,
            minimum=1_000,
        )
        if not self.api_keys:
            raise ValueError(
                "GEMINI_API_KEY environment variable is not set. "
                "Please set it before starting the analysis engine."
            )
        # The Google SDK also reads GOOGLE_API_KEY/GEMINI_API_KEY from the
        # environment and may prefer GOOGLE_API_KEY over an explicit client key.
        # Hide env keys while constructing clients so comma-separated key pools
        # are never sent to Gemini as a single invalid API key.
        google_api_key = os.environ.pop("GOOGLE_API_KEY", None)
        gemini_api_key = os.environ.pop("GEMINI_API_KEY", None)
        try:
            self.clients = [
                genai.Client(
                    api_key=api_key,
                    http_options=types.HttpOptions(timeout=self.request_timeout_ms),
                )
                for api_key in self.api_keys
            ]
        finally:
            if google_api_key is not None:
                os.environ["GOOGLE_API_KEY"] = google_api_key
            if gemini_api_key is not None:
                os.environ["GEMINI_API_KEY"] = gemini_api_key
        self.active_client_index = 0
        logger.info(
            "ClaudeAnalyzer initialized with %d Gemini API key(s), request_timeout_ms=%d",
            len(self.api_keys),
            self.request_timeout_ms,
        )

    @staticmethod
    def _load_api_keys() -> list[str]:
        raw_values = [
            os.environ.get("GEMINI_API_KEY", ""),
            os.environ.get("GOOGLE_API_KEY", ""),
        ]
        keys: list[str] = []
        seen: set[str] = set()

        for raw_value in raw_values:
            for key in raw_value.split(","):
                normalized = key.strip()
                if normalized and normalized not in seen:
                    keys.append(normalized)
                    seen.add(normalized)

        return keys

    @staticmethod
    def _redact_key(api_key: str) -> str:
        if len(api_key) <= 8:
            return "****"
        return f"{api_key[:4]}...{api_key[-4:]}"

    @staticmethod
    def _response_to_json(response: types.GenerateContentResponse) -> dict:
        parsed = getattr(response, "parsed", None)
        if parsed is not None:
            if hasattr(parsed, "model_dump"):
                return parsed.model_dump()
            if isinstance(parsed, dict):
                return parsed

        return json.loads(response.text)

    def _repair_json_response(
        self,
        raw_text: str,
        schema: dict,
        label: str,
    ) -> dict:
        if not raw_text or not raw_text.strip():
            raise ValueError(f"{label} response was empty; nothing to repair")

        schema_json = json.dumps(schema, indent=2)
        repair_prompt = f"""\
The text below is malformed JSON returned by a previous model call.

Repair it into valid JSON that matches the provided JSON schema.

Rules:
- Return only raw JSON. Do not include markdown fences, comments, or explanation.
- Do not add new facts, observations, quotes, scores, or fields that are not supported by the malformed JSON.
- Preserve all complete valid items from the malformed JSON.
- If the malformed JSON is truncated, omit incomplete trailing objects/array items instead of inventing missing content.
- Escape strings correctly. Do not leave unescaped newlines inside JSON strings.

## JSON Schema

```json
{schema_json}
```

## Malformed JSON

```json
{raw_text}
```
"""

        logger.info("Attempting JSON repair for %s", label)
        response = self._generate_content_with_key_fallback(
            model=self.MODEL,
            contents=repair_prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You repair malformed JSON exactly. You do not infer, invent, "
                    "complete missing facts, or add unsupported content. Return only "
                    "valid JSON matching the requested schema."
                ),
                temperature=0.0,
                max_output_tokens=32000,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
        return self._response_to_json(response)

    def _generate_content_with_key_fallback(self, **kwargs) -> types.GenerateContentResponse:
        last_error: Exception | None = None
        model = kwargs.get("model")

        for offset in range(len(self.clients)):
            client_index = (self.active_client_index + offset) % len(self.clients)
            api_key = self.api_keys[client_index]
            try:
                response = self.clients[client_index].models.generate_content(**kwargs)
                self.active_client_index = client_index
                return response
            except Exception as exc:
                if is_timeout_exception(exc):
                    last_error = AnalysisTimeoutError(
                        f"Gemini request timed out after {self.request_timeout_ms} ms",
                        phase="gemini_generate_content",
                        timeout_ms=self.request_timeout_ms,
                        model=str(model) if model else None,
                    )
                else:
                    last_error = exc
                logger.warning(
                    "Gemini request failed with API key %s (%d/%d): %s",
                    self._redact_key(api_key),
                    offset + 1,
                    len(self.clients),
                    last_error,
                )

        raise last_error or RuntimeError("Gemini request failed for all configured API keys")

    # ------------------------------------------------------------------
    # Pass 1: Extract factual observations
    # ------------------------------------------------------------------

    def _build_pass1_message(
        self,
        challenge_description: str,
        session_metadata: dict,
        transcript: str,
    ) -> str:
        metadata_lines = [f"- **{k}**: {v}" for k, v in session_metadata.items()]
        metadata_block = "\n".join(metadata_lines) if metadata_lines else "N/A"

        return f"""\
## Challenge Description

{challenge_description}

## Session Metadata

{metadata_block}

## Transcript

{transcript}

## Your Task — Extract Observations

Carefully read the transcript above and extract EVERY factual observation:

1. **candidate_actions**: List every distinct action the candidate took in chronological order.
   - Use the EXACT segment reference (e.g., "#5") from the transcript headers.
   - Include a near-verbatim quote of what the candidate typed or did.
   - Do NOT invent actions that are not in the transcript.
   - If a "command" or "prompt" segment contains only gibberish, arrow-key artifacts,
     or single characters, still record it accurately (e.g., "Single character input 's'").

2. **ai_interactions**: Summarize each AI response briefly.

3. **session_summary**: Provide factual counts and booleans about the session.
   - Be accurate: if the candidate never ran tests, set tests_run to false.
   - If the candidate never wrote or modified code, set code_written_or_modified to false.

CRITICAL: Only record what ACTUALLY appears in the transcript. Do not infer, assume,
or fabricate any actions or content."""

    def _run_pass1(
        self,
        challenge_description: str,
        session_metadata: dict,
        transcript: str,
    ) -> tuple[dict, dict]:
        """Pass 1: Extract structured observations from the transcript."""
        message = self._build_pass1_message(
            challenge_description, session_metadata, transcript
        )

        last_error: Exception | None = None
        pass1_usage: dict = {}

        for attempt in range(1, self.MAX_RETRIES + 2):
            logger.info(
                "Pass 1: Extracting observations (attempt %d/%d)",
                attempt, self.MAX_RETRIES + 1,
            )

            response = self._generate_content_with_key_fallback(
                model=self.MODEL,
                contents=message,
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "You are a precise transcript analyst. Your job is to extract "
                        "factual observations from candidate session transcripts. "
                        "You must NEVER fabricate, invent, or assume information. "
                        "Only record what is explicitly present in the transcript."
                    ),
                    temperature=0.1,  # Very low for factual extraction
                    max_output_tokens=32000,
                    response_mime_type="application/json",
                    response_schema=_OBSERVATION_SCHEMA,
                ),
            )

            # Capture token usage from Gemini response
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                um = response.usage_metadata
                pass1_usage = {
                    "input_tokens": getattr(um, 'prompt_token_count', 0) or 0,
                    "output_tokens": getattr(um, 'candidates_token_count', 0) or 0,
                }
                logger.info(
                    "Pass 1 token usage: input=%d, output=%d",
                    pass1_usage["input_tokens"], pass1_usage["output_tokens"],
                )

            try:
                observations = self._response_to_json(response)
                logger.info(
                    "Pass 1 complete: %d candidate actions, %d AI interactions",
                    len(observations.get("candidate_actions", [])),
                    len(observations.get("ai_interactions", [])),
                )
                return observations, pass1_usage

            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                last_error = exc
                logger.warning(
                    "Pass 1 attempt %d failed: %s", attempt, str(exc)
                )
                try:
                    observations = self._repair_json_response(
                        raw_text=getattr(response, "text", "") or "",
                        schema=_OBSERVATION_SCHEMA,
                        label="Pass 1 observations",
                    )
                    logger.info(
                        "Pass 1 JSON repair complete: %d candidate actions, %d AI interactions",
                        len(observations.get("candidate_actions", [])),
                        len(observations.get("ai_interactions", [])),
                    )
                    return observations, pass1_usage
                except (json.JSONDecodeError, ValueError, TypeError) as repair_exc:
                    last_error = repair_exc
                    logger.warning(
                        "Pass 1 JSON repair failed: %s", str(repair_exc)
                    )

                if attempt <= self.MAX_RETRIES:
                    original_message = self._build_pass1_message(
                        challenge_description, session_metadata, transcript
                    )
                    message = (
                        f"{original_message}\n\n"
                        f"NOTE: Your previous response was invalid JSON. "
                        f"Error: {exc}\n\nPlease produce a complete, valid JSON response."
                    )

        raise ValueError(
            f"Pass 1 failed after {self.MAX_RETRIES + 1} attempts. "
            f"Last error: {last_error}"
        )

    # ------------------------------------------------------------------
    # Pass 2: Score based on observations
    # ------------------------------------------------------------------

    def _build_pass2_message(
        self,
        challenge_description: str,
        session_metadata: dict,
        observations: dict,
        challenge_role: str | None = None,
        challenge_tech_stack: str | None = None,
        challenge_seniority: str | None = None,
        challenge_focus_areas: str | None = None,
        challenge_context: str | None = None,
    ) -> str:
        metadata_lines = [f"- **{k}**: {v}" for k, v in session_metadata.items()]
        metadata_block = "\n".join(metadata_lines) if metadata_lines else "N/A"

        observations_json = json.dumps(observations, indent=2)

        context_block = ""
        ctx_fields = [
            ("Role", challenge_role),
            ("Seniority Level", challenge_seniority),
            ("Tech Stack", challenge_tech_stack),
            ("Focus Areas", challenge_focus_areas),
            ("Additional Context", challenge_context),
        ]
        ctx_lines = [f"- **{k}**: {v}" for k, v in ctx_fields if v]
        if ctx_lines:
            context_block = (
                "\n## Challenge Context\n\n"
                + "\n".join(ctx_lines)
                + "\n\nUse the values above **exactly as provided** when calibrating "
                "scoring expectations and writing `comparison` and `expected_standard` fields. "
                "Do NOT infer or re-derive them from the challenge description.\n"
            )

        return f"""\
## Challenge Description

{challenge_description}
{context_block}
## Session Metadata

{metadata_block}

## Verified Observations from Transcript

The following observations were extracted directly from the candidate's session transcript.
These are the ONLY facts you may use for scoring. Do NOT add information beyond what is listed here.
For very large sessions, the observation lists may be a chronological sample rather than every
single extracted observation. When present, use `total_candidate_actions`,
`candidate_actions_retained_for_scoring`, and `ai_interactions_retained_for_scoring` in
`session_summary` to understand how much detail was retained for scoring. Do not penalize the
candidate merely because the observation list was capped; score from the retained evidence and
aggregate summary fields.

```json
{observations_json}
```

{DIMENSION_RUBRICS}

## Scoring Instructions

Based SOLELY on the verified observations above, score the candidate on each dimension.

RULES:
- All scores MUST be on a 0-100 scale as defined in the rubrics.
- Every "evidence" item must reference specific observations from the list above.
- If observations show the candidate took very few actions, score ALL dimensions LOW (0-20).
- If a dimension cannot be evaluated from the observations, score it 0 with narrative
  "Insufficient evidence to evaluate this dimension."
- For timeline_data, use the timestamps from the observations.
- For key_moments, only cite moments from the observations list.
- For prompt_complexity, rate only the prompts listed in the observations.
- The overall_score should reflect the average quality across all dimensions.
- Be rigorous and honest. A candidate who barely engaged deserves scores near 0.

Now produce the complete evaluation."""

    def _run_pass2(
        self,
        challenge_description: str,
        session_metadata: dict,
        observations: dict,
        challenge_role: str | None = None,
        challenge_tech_stack: str | None = None,
        challenge_seniority: str | None = None,
        challenge_focus_areas: str | None = None,
        challenge_context: str | None = None,
    ) -> dict:
        """Pass 2: Score the candidate based on extracted observations."""
        message = self._build_pass2_message(
            challenge_description, session_metadata, observations,
            challenge_role=challenge_role, challenge_tech_stack=challenge_tech_stack,
            challenge_seniority=challenge_seniority, challenge_focus_areas=challenge_focus_areas,
            challenge_context=challenge_context,
        )

        last_error: Exception | None = None

        for attempt in range(1, self.MAX_RETRIES + 2):
            logger.info(
                "Pass 2: Scoring (attempt %d/%d)", attempt, self.MAX_RETRIES + 1
            )

            response = self._generate_content_with_key_fallback(
                model=self.MODEL,
                contents=message,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.3,
                    max_output_tokens=32000,
                    response_mime_type="application/json",
                    response_schema=_SCORING_SCHEMA,
                ),
            )

            raw_text = response.text
            logger.debug("Pass 2 raw response length: %d chars", len(raw_text))

            try:
                parsed = self._response_to_json(response)
                parsed = self._clamp_scores(parsed)

                # Validate against Pydantic schema
                validated = AnalysisResponse(**parsed)
                result = validated.model_dump()

                result["_raw_response"] = raw_text
                result["_model_used"] = self.MODEL

                # Capture token usage from Gemini response
                pass2_usage = {}
                if hasattr(response, 'usage_metadata') and response.usage_metadata:
                    um = response.usage_metadata
                    pass2_usage = {
                        "input_tokens": getattr(um, 'prompt_token_count', 0) or 0,
                        "output_tokens": getattr(um, 'candidates_token_count', 0) or 0,
                    }
                    logger.info(
                        "Pass 2 token usage: input=%d, output=%d",
                        pass2_usage["input_tokens"], pass2_usage["output_tokens"],
                    )
                result["_pass2_usage"] = pass2_usage

                return result

            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                last_error = exc
                logger.warning(
                    "Pass 2 attempt %d failed: %s", attempt, str(exc)
                )
                try:
                    repaired = self._repair_json_response(
                        raw_text=raw_text,
                        schema=_SCORING_SCHEMA,
                        label="Pass 2 scoring",
                    )
                    repaired = self._clamp_scores(repaired)
                    validated = AnalysisResponse(**repaired)
                    result = validated.model_dump()
                    result["_raw_response"] = raw_text
                    result["_model_used"] = self.MODEL
                    result["_pass2_usage"] = pass2_usage if "pass2_usage" in locals() else {}
                    logger.info("Pass 2 JSON repair complete")
                    return result
                except (json.JSONDecodeError, ValueError, TypeError) as repair_exc:
                    last_error = repair_exc
                    logger.warning(
                        "Pass 2 JSON repair failed: %s", str(repair_exc)
                    )

                if attempt <= self.MAX_RETRIES:
                    # Re-send the ORIGINAL message with error context appended
                    # so Gemini retains all the observations and rubrics.
                    original_message = self._build_pass2_message(
                        challenge_description, session_metadata, observations,
                        challenge_role=challenge_role, challenge_tech_stack=challenge_tech_stack,
                        challenge_seniority=challenge_seniority, challenge_focus_areas=challenge_focus_areas,
                        challenge_context=challenge_context,
                    )
                    message = (
                        f"{original_message}\n\n"
                        f"NOTE: Your previous response was invalid JSON. "
                        f"Error: {exc}\n\nPlease produce a complete, valid JSON response."
                    )

        raise ValueError(
            f"Pass 2 failed after {self.MAX_RETRIES + 1} attempts. "
            f"Last error: {last_error}"
        )

    # ------------------------------------------------------------------
    # Transcript Narrative Generation
    # ------------------------------------------------------------------

    def generate_transcript_narrative(
        self,
        cleaned_transcript: str,
        session_metadata: dict | None = None,
    ) -> str:
        """Generate a detailed human-readable markdown narrative of the candidate's session.

        This is a single-pass call — no scoring, no structured schema. The output
        is raw markdown intended to be rendered in the report UI for hiring companies.
        """
        metadata_block = ""
        if session_metadata:
            lines = [f"- **{k}**: {v}" for k, v in session_metadata.items()]
            metadata_block = "## Session Metadata\n\n" + "\n".join(lines) + "\n\n"

        prompt = f"""\
{metadata_block}## Transcript

{cleaned_transcript}

## Your Task

Write a comprehensive, richly detailed markdown document that reconstructs everything \
the candidate did during this session. This document will be read by a hiring company \
as the primary written record of the session — it must stand alone as a complete, \
faithful account without the reader having to look at the transcript.

---

### Structural Requirements

- Organise the document **chronologically** into clearly labelled phases using level-2 \
headings (e.g., `## Initial Exploration`, `## Environment Setup`, \
`## Core Implementation`, `## Debugging Session`, `## Refinement and Testing`, etc.). \
Create as many phases as the session naturally contains — do not collapse distinct \
stages into one.
- Within each phase, use nested bullet points and sub-sections to separate: \
shell commands, AI prompts, AI responses, code changes, errors, and decisions.
- End the document with a `## Session Summary` section that gives a concise \
(3-5 sentence) overview of what the candidate accomplished, where they struggled, \
and how they left the project.

---

### Content Requirements — What to Include

**Shell commands and terminal output:**
- Quote every command the candidate ran, using inline code (e.g., `npm install express`).
- Describe what the command was intended to do and what its output indicated \
(success, error, warnings). If a command produced an error, quote the key error \
message verbatim.

**File operations:**
- Name every file created, modified, or deleted. Describe its purpose and, where \
visible, its key contents (exported functions, API routes, schema definitions, etc.).

**AI prompts (candidate → AI):**
- Quote the candidate's prompt as closely to verbatim as possible, using a \
blockquote (`> "..."`) or inline code block.
- Describe the intent behind the prompt: what problem were they trying to solve?
- Note the specificity and clarity of the prompt — was it precise and well-scoped, \
or vague and broad?

**AI responses and generated code:**
- Describe what the AI produced in response: which files it created or edited, \
which packages it suggested, which patterns it used.
- Note whether the candidate accepted the output as-is, modified it, partially \
applied it, or rejected it — and if they changed it, describe what they changed \
and why (if discernible).

**Errors and failures:**
- Quote the exact error message or exception for every error encountered.
- Describe the candidate's diagnostic process: did they read the error carefully, \
paste it to the AI, make a targeted change, or try random fixes?
- State how (or whether) the error was resolved and how many attempts it took.

**Decision points and reasoning:**
- Wherever the transcript reveals the candidate's thinking (through their prompts, \
comments, or the sequence of their actions), describe that reasoning explicitly.
- If the candidate changed approach mid-way, note what triggered the change.

**Packages and dependencies:**
- List every package installed, the command used, and the apparent reason.

**Testing and verification:**
- Describe any tests run, test commands used, pass/fail results, and how failures \
were addressed.

---

### Accuracy Rules — What NOT to Do

- **Do NOT invent, infer, or extrapolate.** Every statement must be directly \
supported by something present in the transcript. If the transcript does not show \
something, do not include it.
- **Do NOT paraphrase prompts loosely** — use the candidate's actual words as much \
as possible.
- **Do NOT skip transcript segments** because they seem minor. A single-character \
input, a repeated command, or an apparently trivial action may be significant to \
the reader.
- **Do NOT evaluate or score** the candidate — this document is descriptive, not \
judgemental. Use neutral, factual language throughout.
- **Do NOT summarise away detail.** "The candidate set up the project" is \
unacceptable. "The candidate ran `npm init -y`, then installed `express` and \
`cors` using `npm install express cors`, and created an `index.js` file" is correct.

---

### Formatting Rules

- Write in **third person** throughout ("The candidate...", "They then...").
- Use inline code (backticks) for ALL technical terms: filenames, commands, \
package names, function names, API endpoints, environment variables, error names, etc.
- Use blockquotes (`>`) for verbatim AI prompts and key error messages.
- Use **bold** sparingly — only for genuinely critical moments (a breakthrough, \
a serious error, a key architectural decision).
- Do not use horizontal rules inside phases; reserve them only between major sections \
if needed.

Write the full narrative document now:"""

        response = self._generate_content_with_key_fallback(
            model=self.MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are a meticulous technical writer producing a complete, faithful "
                    "session record for a hiring company. Your only source of truth is the "
                    "transcript provided — you must not fabricate, infer, or add anything "
                    "that is not directly supported by what appears in the transcript. "
                    "Write with precision and richness: quote commands verbatim, name every "
                    "file, describe every error, and capture every decision visible in the "
                    "candidate's actions and prompts. Use clear markdown structure throughout."
                ),
                temperature=0.1,
                max_output_tokens=16000,
            ),
        )

        logger.info(
            "Transcript narrative generated: %d characters", len(response.text)
        )
        return response.text

    # ------------------------------------------------------------------
    # Dimension Evidence Enrichment
    # ------------------------------------------------------------------

    _ENRICH_SCHEMA = {
        "type": "object",
        "properties": {
            dim: {
                "type": "object",
                "properties": {
                    "observed_points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "transcript_quote": {"type": "string"},
                                "observation": {"type": "string"},
                                "comparison": {"type": "string"},
                            },
                            "required": ["transcript_quote", "observation", "comparison"],
                        },
                    },
                    "expected_standard": {"type": "string"},
                },
                "required": ["observed_points", "expected_standard"],
            }
            for dim in [
                "problem_decomposition", "first_principles", "creativity",
                "iteration_quality", "debugging_approach", "architecture_thinking",
                "communication_clarity", "efficiency",
            ]
        },
        "required": [
            "problem_decomposition", "first_principles", "creativity",
            "iteration_quality", "debugging_approach", "architecture_thinking",
            "communication_clarity", "efficiency",
        ],
    }

    def enrich_dimension_evidence(
        self,
        transcript: str,
        challenge_description: str,
        existing_dimension_details: dict,
        challenge_role: str | None = None,
        challenge_tech_stack: str | None = None,
        challenge_seniority: str | None = None,
        challenge_focus_areas: str | None = None,
        challenge_context: str | None = None,
    ) -> dict:
        """Generate observed_points and expected_standard for all 8 dimensions.

        Called when an analysis already exists but was created before these fields
        were introduced. Returns a dict keyed by dimension name, each containing
        'observed_points' and 'expected_standard'.
        """
        existing_json = json.dumps(existing_dimension_details, indent=2)

        enrich_ctx_fields = [
            ("Role", challenge_role),
            ("Seniority Level", challenge_seniority),
            ("Tech Stack", challenge_tech_stack),
            ("Focus Areas", challenge_focus_areas),
            ("Additional Context", challenge_context),
        ]
        enrich_ctx_lines = [f"- **{k}**: {v}" for k, v in enrich_ctx_fields if v]
        context_block = ""
        if enrich_ctx_lines:
            context_block = (
                "\n## Challenge Context\n\n"
                + "\n".join(enrich_ctx_lines)
                + "\n\nUse the values above **exactly as provided** when writing "
                "`comparison` and `expected_standard` fields. Do NOT infer or re-derive them "
                "from the challenge description.\n"
            )

        prompt = f"""\
## Challenge Description

{challenge_description}
{context_block}

## Existing Dimension Scores and Narratives

The following scores and narratives were already generated for this session. \
Do NOT change them — your only task is to add evidence.

```json
{existing_json}
```

## Transcript

{transcript}

## Your Task

For EACH of the 8 dimensions above, generate:

1. **observed_points** — a list of specific moments from the transcript relevant to \
this dimension. For every meaningful candidate action, provide:
   - `transcript_quote`: The exact or near-verbatim text the candidate typed or prompted. \
Copy directly from the transcript — do NOT paraphrase.
   - `observation`: What this specific action reveals about the candidate's competence \
on this dimension (1-2 analytical sentences).
   - `comparison`: How this compares to what would be expected from a strong, \
well-prepared candidate for this specific role and challenge. Use the provided role \
and tech stack to calibrate expectations — do not default to a generic \
senior-engineer bar (1-2 sentences).
   Include at least 2-5 points per dimension where the transcript provides evidence.

2. **expected_standard** — 2-4 sentences describing what a strong, well-prepared \
candidate for THIS specific role and challenge would ideally do on this dimension. \
Use the provided role and tech stack to set the bar — be concrete and specific, \
do NOT use a generic senior-engineer-at-100 baseline.

RULES:
- All transcript_quote values must be copied verbatim or near-verbatim from the transcript.
- Do NOT invent quotes that are not present in the transcript.
- Do NOT re-score or alter the existing scores and narratives.
- If a dimension has no relevant evidence in the transcript, still provide 1 entry \
explaining what was absent and what should have been present."""

        last_error: Exception | None = None
        message = prompt

        for attempt in range(1, self.MAX_RETRIES + 2):
            logger.info(
                "Dimension enrichment attempt %d/%d", attempt, self.MAX_RETRIES + 1
            )
            response = self._generate_content_with_key_fallback(
                model=self.MODEL,
                contents=message,
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "You are a precise transcript analyst and technical evaluator. "
                        "Extract exact quotes from the transcript and provide rigorous, "
                        "evidence-based analysis of each dimension. Never fabricate quotes."
                    ),
                    temperature=0.2,
                    max_output_tokens=32000,
                    response_mime_type="application/json",
                    response_schema=self._ENRICH_SCHEMA,
                ),
            )

            try:
                result = self._response_to_json(response)
                logger.info("Dimension enrichment complete")
                return result
            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                last_error = exc
                logger.warning("Enrichment attempt %d failed: %s", attempt, exc)
                try:
                    result = self._repair_json_response(
                        raw_text=getattr(response, "text", "") or "",
                        schema=self._ENRICH_SCHEMA,
                        label="dimension enrichment",
                    )
                    logger.info("Dimension enrichment JSON repair complete")
                    return result
                except (json.JSONDecodeError, ValueError, TypeError) as repair_exc:
                    last_error = repair_exc
                    logger.warning(
                        "Enrichment JSON repair failed: %s", str(repair_exc)
                    )

                if attempt <= self.MAX_RETRIES:
                    message = (
                        f"{prompt}\n\nNOTE: Your previous response was invalid JSON. "
                        f"Error: {exc}\n\nPlease produce a complete, valid JSON response."
                    )

        raise ValueError(
            f"Dimension enrichment failed after {self.MAX_RETRIES + 1} attempts. "
            f"Last error: {last_error}"
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _chunk_text_by_chars(text: str, target_chars: int) -> list[str]:
        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = min(len(text), start + target_chars)
            if end < len(text):
                newline = text.rfind("\n", start, end)
                if newline > start + int(target_chars * 0.6):
                    end = newline + 1
            chunks.append(text[start:end].strip())
            start = end
        return [chunk for chunk in chunks if chunk]

    def _split_large_transcript_block(self, block: str, target_chars: int) -> list[str]:
        """Split a single oversized transcript block while preserving its segment ref."""
        lines = block.splitlines()
        if not lines or not _SEGMENT_HEADER_RE.match(lines[0]):
            return self._chunk_text_by_chars(block, target_chars)

        header = lines[0].strip()
        body = "\n".join(lines[1:]).strip()
        body_target = max(1, target_chars - len(header) - 64)
        body_chunks = self._chunk_text_by_chars(body, body_target)
        if not body_chunks:
            return [header]

        total = len(body_chunks)
        chunks: list[str] = []
        for index, body_chunk in enumerate(body_chunks, start=1):
            continuation = (
                f"{header}\n[Continuation {index}/{total} of the same transcript segment]"
            )
            chunks.append(f"{continuation}\n{body_chunk}".strip())
        return chunks

    def _split_transcript_for_pass1(self, transcript: str) -> list[str]:
        """Split oversized transcripts on transcript segment boundaries."""
        target_chars = _TRANSCRIPT_CHUNK_TARGET_CHARS
        matches = list(_SEGMENT_HEADER_RE.finditer(transcript))
        if not matches:
            return self._chunk_text_by_chars(transcript, target_chars)

        prefix = transcript[: matches[0].start()].strip()
        blocks: list[str] = []
        for idx, match in enumerate(matches):
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(transcript)
            block = transcript[match.start():end].strip()
            if block:
                blocks.append(block)

        chunks: list[str] = []
        current_parts: list[str] = [prefix] if prefix else []
        current_len = len(prefix)

        def flush() -> None:
            nonlocal current_parts, current_len
            if prefix and not any(part and part != prefix for part in current_parts):
                current_parts = [prefix]
                current_len = len(prefix)
                return

            chunk = "\n\n".join(part for part in current_parts if part).strip()
            if chunk:
                chunks.append(chunk)
            current_parts = [prefix] if prefix else []
            current_len = len(prefix)

        for block in blocks:
            if len(block) > target_chars:
                flush()
                chunks.extend(self._split_large_transcript_block(block, target_chars))
                continue

            next_len = current_len + len(block) + 2
            if current_len > len(prefix) and next_len > target_chars:
                flush()

            current_parts.append(block)
            current_len += len(block) + 2

        flush()
        return chunks or [transcript]

    @staticmethod
    def _wrap_transcript_chunk(chunk: str, index: int, total: int) -> str:
        return f"""\
============================================================
CANDIDATE SESSION TRANSCRIPT CHUNK {index} OF {total}
Segment references are original transcript references. Analyze only this chunk.
============================================================

{chunk}

============================================================
END OF TRANSCRIPT CHUNK {index} OF {total}
============================================================"""

    @staticmethod
    def _truncate_observation_text(value: object, limit: int) -> object:
        if not isinstance(value, str):
            return value
        text = re.sub(r"\s+", " ", value).strip()
        if len(text) <= limit:
            return text
        return text[:limit].rstrip() + "..."

    def _sanitize_candidate_action(self, action: object) -> dict | None:
        if not isinstance(action, dict):
            return None
        sanitized = dict(action)
        sanitized["description"] = self._truncate_observation_text(
            sanitized.get("description", ""),
            700,
        )
        sanitized["verbatim_quote"] = self._truncate_observation_text(
            sanitized.get("verbatim_quote", ""),
            900,
        )
        return sanitized

    def _sanitize_ai_interaction(self, interaction: object) -> dict | None:
        if not isinstance(interaction, dict):
            return None
        sanitized = dict(interaction)
        sanitized["summary"] = self._truncate_observation_text(
            sanitized.get("summary", ""),
            700,
        )
        return sanitized

    @staticmethod
    def _observation_key(item: dict, fields: tuple[str, ...]) -> tuple[str, ...]:
        values: list[str] = []
        for field in fields:
            value = str(item.get(field, "")).lower()
            value = re.sub(r"\s+", " ", value).strip()
            values.append(value[:300])
        return tuple(values)

    @staticmethod
    def _cap_ordered_observations(items: list[dict], limit: int) -> list[dict]:
        if limit <= 0:
            return []
        if len(items) <= limit:
            return items
        if limit == 1:
            return items[:1]

        last_index = len(items) - 1
        sampled_indexes = {
            round(index * last_index / (limit - 1))
            for index in range(limit)
        }
        return [items[index] for index in sorted(sampled_indexes)]

    @staticmethod
    def _cap_ordered_text_chunks(items: list[str], limit: int) -> list[str]:
        if limit <= 0:
            return []
        if len(items) <= limit:
            return items
        if limit == 1:
            return items[:1]

        last_index = len(items) - 1
        sampled_indexes = {
            round(index * last_index / (limit - 1))
            for index in range(limit)
        }
        return [items[index] for index in sorted(sampled_indexes)]

    @staticmethod
    def _observations_payload_chars(observations: dict) -> int:
        return len(json.dumps(observations, ensure_ascii=False, separators=(",", ":")))

    def _observations_with_scoring_limits(
        self,
        observations: dict,
        *,
        action_limit: int,
        ai_limit: int,
        description_limit: int,
        quote_limit: int,
        ai_summary_limit: int,
        reduced: bool,
    ) -> dict:
        raw_actions = observations.get("candidate_actions", [])
        raw_ai = observations.get("ai_interactions", [])
        actions = raw_actions if isinstance(raw_actions, list) else []
        ai_interactions = raw_ai if isinstance(raw_ai, list) else []

        capped_actions = self._cap_ordered_observations(actions, action_limit)
        capped_ai = self._cap_ordered_observations(ai_interactions, ai_limit)

        scoring_actions: list[dict] = []
        for action in capped_actions:
            if not isinstance(action, dict):
                continue
            scoring_action = dict(action)
            scoring_action["description"] = self._truncate_observation_text(
                scoring_action.get("description", ""),
                description_limit,
            )
            scoring_action["verbatim_quote"] = self._truncate_observation_text(
                scoring_action.get("verbatim_quote", ""),
                quote_limit,
            )
            scoring_actions.append(scoring_action)

        scoring_ai: list[dict] = []
        for interaction in capped_ai:
            if not isinstance(interaction, dict):
                continue
            scoring_interaction = dict(interaction)
            scoring_interaction["summary"] = self._truncate_observation_text(
                scoring_interaction.get("summary", ""),
                ai_summary_limit,
            )
            scoring_ai.append(scoring_interaction)

        summary = observations.get("session_summary", {})
        scoring_summary = dict(summary) if isinstance(summary, dict) else {}
        scoring_summary["total_candidate_actions"] = len(actions)
        scoring_summary["candidate_actions_retained_for_scoring"] = len(scoring_actions)
        scoring_summary["ai_interactions_retained_for_scoring"] = len(scoring_ai)
        scoring_summary["observations_reduced_for_scoring"] = reduced

        return {
            "candidate_actions": scoring_actions,
            "ai_interactions": scoring_ai,
            "session_summary": scoring_summary,
        }

    def _fit_observations_to_scoring_budget(self, observations: dict) -> dict:
        budget = _MAX_SCORING_OBSERVATIONS_CHARS
        actions = observations.get("candidate_actions", [])
        ai_interactions = observations.get("ai_interactions", [])
        action_limit = len(actions) if isinstance(actions, list) else 0
        ai_limit = len(ai_interactions) if isinstance(ai_interactions, list) else 0

        text_limit_plans = [
            (700, 900, 700),
            (500, 650, 500),
            (300, 400, 300),
            (180, 260, 180),
        ]

        for description_limit, quote_limit, ai_summary_limit in text_limit_plans:
            while True:
                reduced = (
                    action_limit < (len(actions) if isinstance(actions, list) else 0)
                    or ai_limit < (len(ai_interactions) if isinstance(ai_interactions, list) else 0)
                    or (description_limit, quote_limit, ai_summary_limit) != text_limit_plans[0]
                )
                candidate = self._observations_with_scoring_limits(
                    observations,
                    action_limit=action_limit,
                    ai_limit=ai_limit,
                    description_limit=description_limit,
                    quote_limit=quote_limit,
                    ai_summary_limit=ai_summary_limit,
                    reduced=reduced,
                )
                payload_chars = self._observations_payload_chars(candidate)
                candidate["session_summary"]["scoring_observations_payload_chars"] = payload_chars
                if payload_chars <= budget:
                    if reduced:
                        logger.info(
                            "Reduced scoring observations payload: chars=%d budget=%d actions=%d ai=%d",
                            payload_chars,
                            budget,
                            len(candidate["candidate_actions"]),
                            len(candidate["ai_interactions"]),
                        )
                    return candidate

                if action_limit == 0 and ai_limit == 0:
                    break

                ratio = max(0.1, min(0.85, (budget / max(payload_chars, 1)) * 0.9))
                next_action_limit = int(action_limit * ratio)
                next_ai_limit = int(ai_limit * ratio)
                if action_limit > 0 and next_action_limit >= action_limit:
                    next_action_limit = action_limit - 1
                if ai_limit > 0 and next_ai_limit >= ai_limit:
                    next_ai_limit = ai_limit - 1
                action_limit = max(0, next_action_limit)
                ai_limit = max(0, next_ai_limit)

        fallback = self._observations_with_scoring_limits(
            observations,
            action_limit=0,
            ai_limit=0,
            description_limit=0,
            quote_limit=0,
            ai_summary_limit=0,
            reduced=True,
        )
        fallback["session_summary"]["scoring_observations_payload_chars"] = (
            self._observations_payload_chars(fallback)
        )
        logger.warning(
            "Scoring observations exceeded budget even after reduction; using summary-only payload: chars=%d budget=%d",
            fallback["session_summary"]["scoring_observations_payload_chars"],
            budget,
        )
        return fallback

    def _merge_observation_chunks(self, observation_chunks: list[dict]) -> dict:
        candidate_actions: list[dict] = []
        ai_interactions: list[dict] = []
        seen_actions: set[tuple[str, ...]] = set()
        seen_ai: set[tuple[str, ...]] = set()

        tools_used: set[str] = set()
        duration_estimate = 0.0
        problem_solving_attempted = False
        bugs_identified = 0
        bugs_fixed = 0
        tests_run = False
        code_written_or_modified = False

        for observations in observation_chunks:
            if not isinstance(observations, dict):
                logger.warning(
                    "Skipping malformed Pass 1 chunk observations: %s",
                    type(observations).__name__,
                )
                continue

            for action in observations.get("candidate_actions", []):
                sanitized = self._sanitize_candidate_action(action)
                if not sanitized:
                    continue
                key = self._observation_key(
                    sanitized,
                    ("segment_ref", "action_type", "verbatim_quote"),
                )
                if key in seen_actions:
                    continue
                seen_actions.add(key)
                candidate_actions.append(sanitized)

            for interaction in observations.get("ai_interactions", []):
                sanitized = self._sanitize_ai_interaction(interaction)
                if not sanitized:
                    continue
                key = self._observation_key(sanitized, ("segment_ref", "summary"))
                if key in seen_ai:
                    continue
                seen_ai.add(key)
                ai_interactions.append(sanitized)

            summary = observations.get("session_summary", {})
            if isinstance(summary, dict):
                tools = summary.get("tools_used", [])
                if not isinstance(tools, list):
                    tools = []
                for tool in tools:
                    if isinstance(tool, str) and tool.strip():
                        tools_used.add(tool.strip())
                try:
                    duration_estimate = max(
                        duration_estimate,
                        float(summary.get("session_duration_estimate_minutes", 0) or 0),
                    )
                except (TypeError, ValueError):
                    pass
                problem_solving_attempted = (
                    problem_solving_attempted
                    or bool(summary.get("problem_solving_attempted"))
                )
                tests_run = tests_run or bool(summary.get("tests_run"))
                code_written_or_modified = (
                    code_written_or_modified
                    or bool(summary.get("code_written_or_modified"))
                )
                try:
                    bugs_identified += int(summary.get("bugs_identified", 0) or 0)
                except (TypeError, ValueError):
                    pass
                try:
                    bugs_fixed += int(summary.get("bugs_fixed", 0) or 0)
                except (TypeError, ValueError):
                    pass

        capped_candidate_actions = self._cap_ordered_observations(
            candidate_actions,
            _MAX_CANDIDATE_ACTIONS_FOR_SCORING,
        )
        if len(capped_candidate_actions) < len(candidate_actions):
            logger.info(
                "Capped candidate action observations for scoring: %d -> %d",
                len(candidate_actions),
                len(capped_candidate_actions),
            )

        capped_ai = self._cap_ordered_observations(
            ai_interactions,
            _MAX_AI_OBSERVATIONS_FOR_SCORING,
        )
        if len(capped_ai) < len(ai_interactions):
            logger.info(
                "Capped AI interaction observations for scoring: %d -> %d",
                len(ai_interactions),
                len(capped_ai),
            )

        return {
            "candidate_actions": capped_candidate_actions,
            "ai_interactions": capped_ai,
            "session_summary": {
                "total_candidate_actions": len(candidate_actions),
                "candidate_actions_retained_for_scoring": len(capped_candidate_actions),
                "ai_interactions_retained_for_scoring": len(capped_ai),
                "session_duration_estimate_minutes": duration_estimate,
                "tools_used": sorted(tools_used),
                "problem_solving_attempted": problem_solving_attempted,
                "bugs_identified": bugs_identified,
                "bugs_fixed": bugs_fixed,
                "tests_run": tests_run,
                "code_written_or_modified": code_written_or_modified,
            },
        }

    @staticmethod
    def _combine_usage(usages: list[dict]) -> dict:
        return {
            "input_tokens": sum(int(usage.get("input_tokens", 0) or 0) for usage in usages),
            "output_tokens": sum(int(usage.get("output_tokens", 0) or 0) for usage in usages),
            "chunk_count": len(usages),
        }

    def _run_pass1_chunked(
        self,
        challenge_description: str,
        session_metadata: dict,
        transcript: str,
    ) -> tuple[dict, dict]:
        chunks = self._split_transcript_for_pass1(transcript)
        if len(chunks) <= 1:
            return self._run_pass1(challenge_description, session_metadata, transcript)

        original_chunk_count = len(chunks)
        if len(chunks) > _MAX_PASS1_CHUNKS:
            chunks = self._cap_ordered_text_chunks(chunks, _MAX_PASS1_CHUNKS)
            logger.warning(
                "Capped Pass 1 transcript chunks for oversized session: %d -> %d",
                original_chunk_count,
                len(chunks),
            )

        logger.info(
            "Chunked pass 1 enabled: transcript_chars=%d chunks=%d target_chars=%d",
            len(transcript),
            len(chunks),
            _TRANSCRIPT_CHUNK_TARGET_CHARS,
        )

        observation_chunks: list[dict] = []
        usage_chunks: list[dict] = []
        for index, chunk in enumerate(chunks, start=1):
            chunk_metadata = {
                **session_metadata,
                "Transcript Chunk": f"{index}/{len(chunks)}",
                "Chunk Characters": len(chunk),
            }
            if original_chunk_count > len(chunks):
                chunk_metadata["Transcript Chunk Sampling"] = (
                    f"Retained {len(chunks)} of {original_chunk_count} chunks"
                )
            observations, usage = self._run_pass1(
                challenge_description,
                chunk_metadata,
                self._wrap_transcript_chunk(chunk, index, len(chunks)),
            )
            observation_chunks.append(observations)
            usage_chunks.append(usage)

        merged = self._merge_observation_chunks(observation_chunks)
        usage = self._combine_usage(usage_chunks)
        logger.info(
            "Chunked pass 1 merged: candidate_actions=%d ai_interactions=%d",
            len(merged.get("candidate_actions", [])),
            len(merged.get("ai_interactions", [])),
        )
        return merged, usage

    def _clamp_scores(self, data: dict) -> dict:
        """Ensure all scores are within 0-100."""
        overall = data.get("overall_score", 0)
        data["overall_score"] = max(0.0, min(100.0, float(overall)))

        dims = data.get("dimensions", {})
        for dim_val in dims.values():
            if isinstance(dim_val, dict):
                score = dim_val.get("score", 0)
                dim_val["score"] = max(0.0, min(100.0, float(score)))

        return data

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(
        self,
        challenge_description: str,
        session_metadata: dict,
        transcript: str,
        challenge_role: str | None = None,
        challenge_tech_stack: str | None = None,
        challenge_seniority: str | None = None,
        challenge_focus_areas: str | None = None,
        challenge_context: str | None = None,
    ) -> dict:
        """Run the full two-pass analysis pipeline.

        Pass 1: Extract factual observations from the transcript.
        Pass 2: Score the candidate based solely on extracted observations.

        This two-pass approach prevents hallucination by ensuring the model
        can only reference facts it explicitly extracted in Pass 1.
        """
        # Pass 1: Extract observations. Oversized transcripts are split on
        # segment boundaries to avoid provider-side prefill/decode deadlines.
        if len(transcript) > _TRANSCRIPT_CHUNK_THRESHOLD_CHARS:
            observations, pass1_usage = self._run_pass1_chunked(
                challenge_description,
                session_metadata,
                transcript,
            )
        else:
            observations, pass1_usage = self._run_pass1(
                challenge_description,
                session_metadata,
                transcript,
            )

        observations_for_scoring = self._fit_observations_to_scoring_budget(observations)

        # Pass 2: Score based on observations
        result = self._run_pass2(
            challenge_description, session_metadata, observations_for_scoring,
            challenge_role=challenge_role, challenge_tech_stack=challenge_tech_stack,
            challenge_seniority=challenge_seniority, challenge_focus_areas=challenge_focus_areas,
            challenge_context=challenge_context,
        )

        # Attach observations for transparency/debugging
        result["_observations"] = observations_for_scoring

        # Aggregate Gemini token usage across both passes
        pass2_usage = result.pop("_pass2_usage", {})
        total_input = pass1_usage.get("input_tokens", 0) + pass2_usage.get("input_tokens", 0)
        total_output = pass1_usage.get("output_tokens", 0) + pass2_usage.get("output_tokens", 0)
        result["_gemini_usage"] = {
            "model": self.MODEL,
            "input_tokens": total_input,
            "output_tokens": total_output,
            "pass1_input": pass1_usage.get("input_tokens", 0),
            "pass1_output": pass1_usage.get("output_tokens", 0),
            "pass2_input": pass2_usage.get("input_tokens", 0),
            "pass2_output": pass2_usage.get("output_tokens", 0),
            "chunked_pass1": len(transcript) > _TRANSCRIPT_CHUNK_THRESHOLD_CHARS,
            "pass1_chunks": pass1_usage.get("chunk_count", 1),
        }
        logger.info(
            "Total Gemini usage: input=%d, output=%d tokens",
            total_input, total_output,
        )

        return result
