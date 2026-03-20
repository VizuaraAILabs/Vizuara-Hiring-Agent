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
    },
    "required": ["score", "narrative", "evidence"],
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

Write a comprehensive, detailed markdown document that describes everything the candidate \
did during this session. This document will be read by a hiring company to understand the \
candidate's technical approach, decisions, and capabilities.

**Requirements:**

- Write in third person ("The candidate...")
- Be **very detailed** — cover every meaningful action, tool used, file created, command \
run, package installed, error encountered, and decision made. Do not skip anything significant.
- Organize chronologically with clear markdown headings for each distinct phase \
(e.g., `## Project Setup`, `## Server Implementation`, `## Debugging`, `## Testing`, etc.). \
Use as many phases as the session warrants.
- Use bullet points freely to enumerate: specific shell commands run, packages installed, \
files created or modified, API endpoints defined, functions written, errors encountered, etc.
- Use inline code formatting (backticks) for ALL technical terms: commands, filenames, \
package names, function names, endpoints, variable names, etc.
- Describe how the candidate used AI assistance in detail — what they asked, how specific \
or vague their prompts were, whether they followed AI suggestions or modified them.
- Note every error or failed attempt and exactly how it was resolved.
- Capture the candidate's reasoning and approach where it is visible from their prompts \
and commands.
- Do NOT evaluate, score, or judge the candidate — only describe what happened.
- Do NOT omit steps to be concise. The goal is a thorough, complete record.
- The document should be detailed enough that a reader who never saw the session can \
fully reconstruct what happened technically.

Write the full narrative document now:"""

        response = self.client.models.generate_content(
            model=self.MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are a technical writer creating detailed session documentation. "
                    "Write comprehensive markdown that describes the candidate's actions "
                    "step by step with full technical detail. Use proper markdown headings, "
                    "bullet points, and inline code formatting throughout."
                ),
                temperature=0.3,
                max_output_tokens=8000,
            ),
        )

        logger.info(
            "Transcript narrative generated: %d characters", len(response.text)
        )
        return response.text

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
