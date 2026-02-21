from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class DimensionScore(BaseModel):
    score: float = Field(..., ge=0, le=100, description="Score from 0 to 100")
    narrative: str = Field(..., description="Qualitative narrative for this dimension")
    evidence: list[str] = Field(
        default_factory=list,
        description="Specific evidence from the transcript supporting this score",
    )


class KeyMoment(BaseModel):
    timestamp: str = Field(..., description="Approximate timestamp or position in session")
    type: Literal["strength", "weakness", "pivot", "insight"] = Field(
        ..., description="Category of this key moment"
    )
    title: str = Field(..., description="Short title for the moment")
    description: str = Field(..., description="Detailed description of what happened")
    interaction_index: Optional[int] = Field(
        default=None,
        description="Index into the interaction list, if applicable",
    )


class TimelineEntry(BaseModel):
    start_time: float = Field(
        ..., ge=0, description="Minutes into the session when this activity started"
    )
    end_time: float = Field(
        ..., ge=0, description="Minutes into the session when this activity ended"
    )
    activity: str = Field(..., description="Description of the activity")
    category: Literal["planning", "coding", "debugging", "prompting", "reviewing"] = (
        Field(..., description="Category of the activity")
    )


class PromptComplexityEntry(BaseModel):
    sequence: int = Field(..., description="Sequence number of the prompt")
    complexity: float = Field(
        ..., ge=0, le=100, description="Complexity score from 0 to 100"
    )
    label: str = Field(..., description="Short label describing the prompt")


class AnalysisResponse(BaseModel):
    overall_score: float = Field(..., ge=0, le=100, description="Overall score 0-100")
    dimensions: dict[str, DimensionScore] = Field(
        ...,
        description=(
            "Dimension scores keyed by: problem_decomposition, first_principles, "
            "creativity, iteration_quality, debugging_approach, architecture_thinking, "
            "communication_clarity, efficiency"
        ),
    )
    key_moments: list[KeyMoment] = Field(
        default_factory=list, description="Notable moments from the session"
    )
    timeline_data: list[TimelineEntry] = Field(
        default_factory=list, description="Timeline of activities during the session"
    )
    prompt_complexity: list[PromptComplexityEntry] = Field(
        default_factory=list,
        description="Complexity progression of candidate prompts",
    )
    category_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Percentage breakdown by activity category",
    )
    summary_narrative: str = Field(
        ..., description="Overall narrative summary of the candidate's performance"
    )
    strengths: list[str] = Field(
        default_factory=list, description="Key strengths observed"
    )
    areas_for_growth: list[str] = Field(
        default_factory=list, description="Areas where the candidate can improve"
    )
    hiring_recommendation: Literal[
        "strong_yes", "yes", "neutral", "no", "strong_no"
    ] = Field(..., description="Hiring recommendation")


class AnalyzeRequest(BaseModel):
    session_id: str = Field(..., description="The session ID to analyze")
