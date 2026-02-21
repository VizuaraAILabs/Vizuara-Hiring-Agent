from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# All eight evaluation dimensions with equal weights
DIMENSIONS = [
    "problem_decomposition",
    "first_principles",
    "creativity",
    "iteration_quality",
    "debugging_approach",
    "architecture_thinking",
    "communication_clarity",
    "efficiency",
]


class ScoreCalculator:
    """Validates dimension scores and computes a weighted overall score."""

    def _clamp(self, value: float, lo: float = 0.0, hi: float = 100.0) -> float:
        """Clamp a value to the [lo, hi] range."""
        return max(lo, min(hi, value))

    def calculate(self, raw_scores: dict) -> dict:
        """Validate and normalize dimension scores, then compute the overall score.

        Args:
            raw_scores: A dict shaped like AnalysisResponse.model_dump(). Must contain
                a "dimensions" key mapping dimension names to objects with a "score"
                field.

        Returns:
            A copy of raw_scores with:
            - Each dimension score clamped to 0-100
            - "overall_score" recomputed as the weighted average (equal weights)
        """
        result = dict(raw_scores)
        dimensions = result.get("dimensions", {})

        scores: list[float] = []
        normalized_dimensions: dict = {}

        for dim_name in DIMENSIONS:
            dim_data = dimensions.get(dim_name)
            if dim_data is None:
                logger.warning(
                    "Missing dimension '%s' in analysis — defaulting to 0", dim_name
                )
                dim_data = {
                    "score": 0.0,
                    "narrative": "Not evaluated.",
                    "evidence": [],
                }

            raw_score = dim_data.get("score", 0.0)
            try:
                raw_score = float(raw_score)
            except (TypeError, ValueError):
                logger.warning(
                    "Non-numeric score for '%s': %r — defaulting to 0",
                    dim_name,
                    raw_score,
                )
                raw_score = 0.0

            clamped_score = self._clamp(raw_score)

            if clamped_score != raw_score:
                logger.info(
                    "Clamped '%s' score from %.2f to %.2f",
                    dim_name,
                    raw_score,
                    clamped_score,
                )

            normalized_dim = dict(dim_data)
            normalized_dim["score"] = round(clamped_score, 2)
            normalized_dimensions[dim_name] = normalized_dim
            scores.append(clamped_score)

        # Equal-weight average
        if scores:
            overall = sum(scores) / len(scores)
        else:
            overall = 0.0

        result["dimensions"] = normalized_dimensions
        result["overall_score"] = round(overall, 2)

        logger.info(
            "Calculated overall score: %.2f from %d dimensions",
            result["overall_score"],
            len(scores),
        )

        return result
