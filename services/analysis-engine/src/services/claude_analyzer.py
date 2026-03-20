from __future__ import annotations

import json
import logging
import os

from google import genai
from google.genai import types

from ..models.schemas import AnalysisResponse
from ..prompts.dimension_rubrics import DIMENSION_RUBRICS
from ..prompts.system_prompt import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

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
                        "description": "How this compares to what would be expected of a strong candidate for this specific role and challenge — grounded in the stack, domain, and difficulty level described in the challenge, not a generic senior-engineer bar",
                    },
                },
                "required": ["transcript_quote", "observation", "comparison"],
            },
            "description": "Transcript-grounded evidence points for this dimension. Include one entry per meaningful candidate action relevant to this dimension (aim for 2-5 points minimum where evidence exists).",
        },
        "expected_standard": {
            "type": "string",
            "description": "2-4 sentences describing what a strong, well-prepared candidate for THIS specific role and challenge would ideally do on this dimension. Derive the bar from the challenge description: infer the role level, stack, domain, and difficulty, then set expectations accordingly. Do NOT default to 'senior engineer at 100' — calibrate to what this particular challenge actually demands.",
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
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY environment variable is not set. "
                "Please set it before starting the analysis engine."
            )
        self.client = genai.Client(api_key=api_key)

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

            response = self.client.models.generate_content(
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
                observations = json.loads(response.text)
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
    ) -> str:
        metadata_lines = [f"- **{k}**: {v}" for k, v in session_metadata.items()]
        metadata_block = "\n".join(metadata_lines) if metadata_lines else "N/A"

        observations_json = json.dumps(observations, indent=2)

        return f"""\
## Challenge Description

{challenge_description}

## Session Metadata

{metadata_block}

## Verified Observations from Transcript

The following observations were extracted directly from the candidate's session transcript.
These are the ONLY facts you may use for scoring. Do NOT add information beyond what is listed here.

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
    ) -> dict:
        """Pass 2: Score the candidate based on extracted observations."""
        message = self._build_pass2_message(
            challenge_description, session_metadata, observations
        )

        last_error: Exception | None = None

        for attempt in range(1, self.MAX_RETRIES + 2):
            logger.info(
                "Pass 2: Scoring (attempt %d/%d)", attempt, self.MAX_RETRIES + 1
            )

            response = self.client.models.generate_content(
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
                parsed = json.loads(raw_text)
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
                if attempt <= self.MAX_RETRIES:
                    # Re-send the ORIGINAL message with error context appended
                    # so Gemini retains all the observations and rubrics.
                    original_message = self._build_pass2_message(
                        challenge_description, session_metadata, observations
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

        response = self.client.models.generate_content(
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
    ) -> dict:
        """Generate observed_points and expected_standard for all 8 dimensions.

        Called when an analysis already exists but was created before these fields
        were introduced. Returns a dict keyed by dimension name, each containing
        'observed_points' and 'expected_standard'.
        """
        existing_json = json.dumps(existing_dimension_details, indent=2)

        prompt = f"""\
## Challenge Description

{challenge_description}

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
well-prepared candidate for this specific role and challenge. Infer the role level, \
stack, and difficulty from the challenge description — do not default to a generic \
senior-engineer bar (1-2 sentences).
   Include at least 2-5 points per dimension where the transcript provides evidence.

2. **expected_standard** — 2-4 sentences describing what a strong, well-prepared \
candidate for THIS specific role and challenge would ideally do on this dimension. \
Derive the bar from the challenge description: infer the role level, stack, domain, \
and difficulty, then set expectations accordingly. Be concrete and specific — \
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
            response = self.client.models.generate_content(
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
                result = json.loads(response.text)
                logger.info("Dimension enrichment complete")
                return result
            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                last_error = exc
                logger.warning("Enrichment attempt %d failed: %s", attempt, exc)
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
    ) -> dict:
        """Run the full two-pass analysis pipeline.

        Pass 1: Extract factual observations from the transcript.
        Pass 2: Score the candidate based solely on extracted observations.

        This two-pass approach prevents hallucination by ensuring the model
        can only reference facts it explicitly extracted in Pass 1.
        """
        # Pass 1: Extract observations
        observations, pass1_usage = self._run_pass1(
            challenge_description, session_metadata, transcript
        )

        # Pass 2: Score based on observations
        result = self._run_pass2(
            challenge_description, session_metadata, observations
        )

        # Attach observations for transparency/debugging
        result["_observations"] = observations

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
        }
        logger.info(
            "Total Gemini usage: input=%d, output=%d tokens",
            total_input, total_output,
        )

        return result
