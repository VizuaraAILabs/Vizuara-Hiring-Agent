from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Minimum thresholds for a meaningful analysis
MIN_CANDIDATE_INPUTS = 3          # At least 3 candidate commands/prompts
MIN_CANDIDATE_CONTENT_CHARS = 50  # At least 50 chars of candidate input content
MIN_TOTAL_INTERACTIONS = 5        # At least 5 total interactions
MIN_TRANSCRIPT_CHARS = 200        # At least 200 chars of cleaned transcript


class TranscriptQualityGate:
    """Assesses whether a transcript has enough meaningful content for analysis.

    If the transcript is too short, noisy, or lacks candidate input, the analysis
    would be unreliable and Gemini would likely hallucinate. In such cases, we
    return a pre-built "insufficient data" result instead.
    """

    def assess(self, interactions: list[dict], transcript: str) -> dict | None:
        """Check transcript quality and return an insufficient-data result if too low.

        Args:
            interactions: Raw interaction records from the database.
            transcript: The cleaned, formatted transcript string.

        Returns:
            None if quality is sufficient (proceed with analysis).
            A pre-built AnalysisResponse dict if quality is insufficient.
        """
        candidate_inputs = [
            i for i in interactions
            if i.get("direction") == "input"
            and i.get("content", "").strip()
        ]

        candidate_content_len = sum(
            len(i.get("content", "").strip()) for i in candidate_inputs
        )

        issues: list[str] = []

        if len(interactions) < MIN_TOTAL_INTERACTIONS:
            issues.append(
                f"Only {len(interactions)} total interactions "
                f"(minimum: {MIN_TOTAL_INTERACTIONS})"
            )

        if len(candidate_inputs) < MIN_CANDIDATE_INPUTS:
            issues.append(
                f"Only {len(candidate_inputs)} candidate inputs "
                f"(minimum: {MIN_CANDIDATE_INPUTS})"
            )

        if candidate_content_len < MIN_CANDIDATE_CONTENT_CHARS:
            issues.append(
                f"Only {candidate_content_len} chars of candidate input "
                f"(minimum: {MIN_CANDIDATE_CONTENT_CHARS})"
            )

        if len(transcript) < MIN_TRANSCRIPT_CHARS:
            issues.append(
                f"Transcript is only {len(transcript)} chars "
                f"(minimum: {MIN_TRANSCRIPT_CHARS})"
            )

        if not issues:
            logger.info(
                "Transcript quality OK: %d interactions, %d candidate inputs, "
                "%d chars candidate content, %d chars transcript",
                len(interactions),
                len(candidate_inputs),
                candidate_content_len,
                len(transcript),
            )
            return None

        # Quality insufficient — build a canned result
        reason = "; ".join(issues)
        logger.warning("Transcript quality INSUFFICIENT: %s", reason)

        insufficient_dim = {
            "score": 0.0,
            "narrative": (
                "Insufficient transcript data to evaluate this dimension. "
                f"Reason: {reason}"
            ),
            "evidence": [],
        }

        return {
            "overall_score": 0.0,
            "dimensions": {
                "problem_decomposition": dict(insufficient_dim),
                "first_principles": dict(insufficient_dim),
                "creativity": dict(insufficient_dim),
                "iteration_quality": dict(insufficient_dim),
                "debugging_approach": dict(insufficient_dim),
                "architecture_thinking": dict(insufficient_dim),
                "communication_clarity": dict(insufficient_dim),
                "efficiency": dict(insufficient_dim),
            },
            "key_moments": [],
            "timeline_data": [],
            "prompt_complexity": [],
            "category_breakdown": {
                "planning": 0.0,
                "coding": 0.0,
                "debugging": 0.0,
                "prompting": 0.0,
                "reviewing": 0.0,
            },
            "summary_narrative": (
                f"The transcript did not contain enough meaningful candidate activity "
                f"to produce a reliable analysis. {reason}. "
                f"This may indicate the candidate did not engage with the challenge, "
                f"or the session was too short to evaluate."
            ),
            "strengths": [],
            "areas_for_growth": [
                "Engage more actively with the challenge by issuing commands, "
                "writing code, and interacting with the AI assistant.",
            ],
            "hiring_recommendation": "strong_no",
            "_quality_gate": "failed",
            "_quality_issues": issues,
        }
