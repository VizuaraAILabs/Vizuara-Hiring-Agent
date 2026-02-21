from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

import asyncpg

logger = logging.getLogger(__name__)

# Dimension column names in the analysis_results table (must match the DB schema)
_DIMENSION_COLUMNS = [
    "problem_decomposition",
    "first_principles",
    "creativity",
    "iteration_quality",
    "debugging_approach",
    "architecture_thinking",
    "communication_clarity",
    "efficiency",
]


class ReportGenerator:
    """Persists analysis results to the PostgreSQL database."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool
        logger.info("ReportGenerator initialized with asyncpg pool")

    async def save(self, session_id: str, analysis: dict) -> str:
        """Save the analysis results to the database.

        Args:
            session_id: The session being analyzed.
            analysis: The full analysis dict (from ScoreCalculator output).

        Returns:
            The generated analysis_results ID (UUID string).
        """
        analysis_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        # Extract dimension scores
        dimensions = analysis.get("dimensions", {})
        dimension_scores: dict[str, float] = {}
        for dim in _DIMENSION_COLUMNS:
            dim_data = dimensions.get(dim, {})
            dimension_scores[dim] = dim_data.get("score", 0.0)

        # Serialize JSON fields
        dimension_details_json = json.dumps(dimensions)
        key_moments_json = json.dumps(analysis.get("key_moments", []))
        timeline_data_json = json.dumps(analysis.get("timeline_data", []))
        prompt_complexity_json = json.dumps(analysis.get("prompt_complexity", []))
        category_breakdown_json = json.dumps(analysis.get("category_breakdown", {}))
        strengths_json = json.dumps(analysis.get("strengths", []))
        areas_for_growth_json = json.dumps(analysis.get("areas_for_growth", []))

        raw_claude_response = analysis.get("_raw_response")
        model_used = analysis.get("_model_used")

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Insert the analysis result
                await conn.execute(
                    """
                    INSERT INTO analysis_results (
                        id, session_id, overall_score,
                        problem_decomposition, first_principles, creativity,
                        iteration_quality, debugging_approach, architecture_thinking,
                        communication_clarity, efficiency,
                        dimension_details, key_moments, timeline_data,
                        prompt_complexity, category_breakdown,
                        summary_narrative, strengths, areas_for_growth,
                        hiring_recommendation,
                        raw_claude_response, model_used,
                        created_at
                    ) VALUES (
                        $1, $2, $3,
                        $4, $5, $6,
                        $7, $8, $9,
                        $10, $11,
                        $12, $13, $14,
                        $15, $16,
                        $17, $18, $19,
                        $20,
                        $21, $22,
                        $23
                    )
                    """,
                    analysis_id,
                    session_id,
                    analysis.get("overall_score", 0.0),
                    dimension_scores.get("problem_decomposition", 0.0),
                    dimension_scores.get("first_principles", 0.0),
                    dimension_scores.get("creativity", 0.0),
                    dimension_scores.get("iteration_quality", 0.0),
                    dimension_scores.get("debugging_approach", 0.0),
                    dimension_scores.get("architecture_thinking", 0.0),
                    dimension_scores.get("communication_clarity", 0.0),
                    dimension_scores.get("efficiency", 0.0),
                    dimension_details_json,
                    key_moments_json,
                    timeline_data_json,
                    prompt_complexity_json,
                    category_breakdown_json,
                    analysis.get("summary_narrative", ""),
                    strengths_json,
                    areas_for_growth_json,
                    analysis.get("hiring_recommendation", "neutral"),
                    raw_claude_response,
                    model_used,
                    now,
                )

                # Update session status to 'analyzed'
                await conn.execute(
                    "UPDATE sessions SET status = 'analyzed' WHERE id = $1",
                    session_id,
                )

                # Insert interaction annotations for key moments that reference
                # specific interactions
                key_moments = analysis.get("key_moments", [])
                for moment in key_moments:
                    interaction_index = moment.get("interaction_index")
                    if interaction_index is not None:
                        # Look up the actual interaction ID by sequence number
                        row = await conn.fetchrow(
                            """
                            SELECT id FROM interactions
                            WHERE session_id = $1 AND sequence_num = $2
                            """,
                            session_id,
                            interaction_index,
                        )

                        if row:
                            annotation_type = moment.get("type", "insight")
                            # Ensure annotation_type is valid
                            if annotation_type not in (
                                "strength",
                                "weakness",
                                "pivot",
                                "insight",
                            ):
                                annotation_type = "insight"

                            await conn.execute(
                                """
                                INSERT INTO interaction_annotations (
                                    analysis_id, interaction_id, annotation_type,
                                    label, description
                                ) VALUES ($1, $2, $3, $4, $5)
                                """,
                                analysis_id,
                                row["id"],
                                annotation_type,
                                moment.get("title", ""),
                                moment.get("description", ""),
                            )

        logger.info(
            "Saved analysis %s for session %s (score: %.1f)",
            analysis_id,
            session_id,
            analysis.get("overall_score", 0.0),
        )
        return analysis_id
