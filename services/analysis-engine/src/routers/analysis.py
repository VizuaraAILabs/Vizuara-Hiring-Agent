from __future__ import annotations

import asyncio
import json
import logging
import os

import asyncpg
from fastapi import APIRouter, HTTPException

from ..models.schemas import AnalyzeRequest
from ..services.claude_analyzer import ClaudeAnalyzer
from ..services.evidence_verifier import EvidenceVerifier
from ..services.report_generator import ReportGenerator
from ..services.score_calculator import ScoreCalculator
from ..services.transcript_parser import TranscriptParser
from ..services.transcript_quality import TranscriptQualityGate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyze", tags=["analysis"])

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://hiring:hiring@localhost:5432/hiring_agent",
)

# Connection pool — initialized lazily
_pool: asyncpg.Pool | None = None


async def _get_pool() -> asyncpg.Pool:
    """Get or create the asyncpg connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def _fetch_session(pool: asyncpg.Pool, session_id: str) -> dict:
    """Fetch session record from the database."""
    row = await pool.fetchrow(
        "SELECT * FROM sessions WHERE id = $1", session_id
    )
    if not row:
        raise HTTPException(
            status_code=404, detail=f"Session '{session_id}' not found"
        )
    return dict(row)


async def _fetch_challenge(pool: asyncpg.Pool, challenge_id: str) -> dict:
    """Fetch challenge record from the database."""
    row = await pool.fetchrow(
        "SELECT * FROM challenges WHERE id = $1", challenge_id
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Challenge '{challenge_id}' not found for this session",
        )
    return dict(row)


async def _fetch_interactions(pool: asyncpg.Pool, session_id: str) -> list[dict]:
    """Fetch all interactions for a session, ordered by sequence number."""
    rows = await pool.fetch(
        """
        SELECT id, session_id, sequence_num, timestamp, direction,
               content, content_type, metadata
        FROM interactions
        WHERE session_id = $1
        ORDER BY sequence_num ASC
        """,
        session_id,
    )
    result = []
    for row in rows:
        d = dict(row)
        # Convert metadata from jsonb to string for compatibility with transcript parser
        if isinstance(d.get("metadata"), dict):
            d["metadata"] = json.dumps(d["metadata"])
        # Convert timestamp to string
        if d.get("timestamp"):
            d["timestamp"] = str(d["timestamp"])
        # Convert UUID to string
        if d.get("session_id"):
            d["session_id"] = str(d["session_id"])
        result.append(d)
    return result


@router.post("/enrich-dimensions")
async def enrich_dimension_evidence(request: AnalyzeRequest) -> dict:
    """Add observed_points and expected_standard to all 8 dimensions in an existing analysis.

    Safe to call on analyses that already have these fields — returns immediately if all
    dimensions already contain at least one observed_point.
    """
    session_id = request.session_id
    logger.info("Dimension enrichment requested for session: %s", session_id)

    pool = await _get_pool()

    existing = await pool.fetchrow(
        "SELECT dimension_details FROM analysis_results WHERE session_id = $1",
        session_id,
    )
    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"No analysis record found for session '{session_id}'. Run /analyze first.",
        )

    import json as _json

    raw_details = existing["dimension_details"]
    if isinstance(raw_details, str):
        dimension_details: dict = _json.loads(raw_details)
    else:
        dimension_details = dict(raw_details) if raw_details else {}

    # Check if already enriched (all dims have at least 1 observed_point)
    dims = [
        "problem_decomposition", "first_principles", "creativity",
        "iteration_quality", "debugging_approach", "architecture_thinking",
        "communication_clarity", "efficiency",
    ]
    already_enriched = all(
        dimension_details.get(d, {}).get("observed_points")
        for d in dims
    )
    if already_enriched:
        logger.info("Dimensions already enriched for session %s — returning cached", session_id)
        return {"dimension_details": dimension_details}

    session = await _fetch_session(pool, session_id)
    challenge = await _fetch_challenge(pool, session["challenge_id"])
    interactions = await _fetch_interactions(pool, session_id)

    if not interactions:
        raise HTTPException(
            status_code=400,
            detail=f"No interactions found for session '{session_id}'",
        )

    try:
        parser = TranscriptParser()
        transcript = parser.parse(interactions)
        logger.info("Parsed transcript for enrichment: %d characters", len(transcript))

        analyzer = ClaudeAnalyzer()
        enrichment = await asyncio.to_thread(
            analyzer.enrich_dimension_evidence,
            transcript=transcript,
            challenge_description=challenge.get("description", ""),
            existing_dimension_details=dimension_details,
            challenge_role=challenge.get("role") or None,
            challenge_tech_stack=challenge.get("tech_stack") or None,
            challenge_seniority=challenge.get("seniority") or None,
            challenge_focus_areas=challenge.get("focus_areas") or None,
            challenge_context=challenge.get("context") or None,
        )

        # Merge observed_points and expected_standard into existing dimension_details
        for dim in dims:
            if dim in enrichment and dim in dimension_details:
                dimension_details[dim]["observed_points"] = enrichment[dim].get("observed_points", [])
                dimension_details[dim]["expected_standard"] = enrichment[dim].get("expected_standard", "")

        await pool.execute(
            "UPDATE analysis_results SET dimension_details = $1::jsonb WHERE session_id = $2",
            _json.dumps(dimension_details),
            session_id,
        )
        logger.info("Dimension evidence saved for session %s", session_id)

        return {"dimension_details": dimension_details}

    except Exception as exc:
        logger.error(
            "Failed to enrich dimensions for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/transcript-narrative")
async def generate_transcript_narrative(request: AnalyzeRequest) -> dict:
    """Generate a detailed human-readable markdown narrative for a session's transcript.

    If the narrative already exists in the database it is returned immediately
    without calling Gemini again.
    """
    session_id = request.session_id
    logger.info("Transcript narrative requested for session: %s", session_id)

    pool = await _get_pool()

    # Check if narrative already exists
    existing = await pool.fetchrow(
        "SELECT transcript_narrative FROM analysis_results WHERE session_id = $1",
        session_id,
    )
    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"No analysis record found for session '{session_id}'. Run /analyze first.",
        )
    if existing["transcript_narrative"]:
        logger.info("Returning cached transcript narrative for session %s", session_id)
        return {"transcript_narrative": existing["transcript_narrative"]}

    # Fetch session and challenge for metadata
    session = await _fetch_session(pool, session_id)
    challenge = await _fetch_challenge(pool, session["challenge_id"])
    interactions = await _fetch_interactions(pool, session_id)

    if not interactions:
        raise HTTPException(
            status_code=400,
            detail=f"No interactions found for session '{session_id}'",
        )

    try:
        # Parse transcript
        parser = TranscriptParser()
        transcript = parser.parse(interactions)
        logger.info("Parsed transcript for narrative: %d characters", len(transcript))

        def _fmt_dt(dt) -> str:
            if dt is None:
                return "Unknown"
            try:
                return dt.strftime("%d/%m/%Y %H:%M:%S")
            except AttributeError:
                return str(dt)

        session_metadata = {
            "Candidate Name": session.get("candidate_name", "Unknown"),
            "Challenge Title": challenge.get("title", "Unknown"),
            "Time Limit (minutes)": challenge.get("time_limit_min", "Unknown"),
            "Session Started": _fmt_dt(session.get("started_at")),
            "Session Ended": _fmt_dt(session.get("ended_at")),
        }

        analyzer = ClaudeAnalyzer()
        narrative = await asyncio.to_thread(
            analyzer.generate_transcript_narrative,
            cleaned_transcript=transcript,
            session_metadata=session_metadata,
        )

        # Persist to DB
        await pool.execute(
            "UPDATE analysis_results SET transcript_narrative = $1 WHERE session_id = $2",
            narrative,
            session_id,
        )
        logger.info("Transcript narrative saved for session %s", session_id)

        return {"transcript_narrative": narrative}

    except Exception as exc:
        logger.error(
            "Failed to generate transcript narrative for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/start")
async def start_analysis_session(request: AnalyzeRequest) -> dict:
    """Start analysis in the background and return immediately."""
    session_id = request.session_id
    logger.info("Background analysis requested for session: %s", session_id)

    pool = await _get_pool()

    session = await _fetch_session(pool, session_id)

    existing = await pool.fetchrow(
        "SELECT id FROM analysis_results WHERE session_id = $1", session_id
    )
    if existing:
        await pool.execute(
            "UPDATE sessions SET status = 'analyzed' WHERE id = $1",
            session_id,
        )
        return {
            "status": "already_analyzed",
            "analysis_id": str(existing["id"]),
            "session_id": session_id,
        }

    if session["status"] == "analyzing":
        return {"status": "already_running", "session_id": session_id}

    if session["status"] not in ("completed", "active"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Session '{session_id}' has status '{session['status']}'. "
                "Only 'completed' or 'active' sessions can be analyzed."
            ),
        )

    updated = await pool.fetchrow(
        """
        UPDATE sessions
        SET status = 'analyzing'
        WHERE id = $1 AND status IN ('completed', 'active')
        RETURNING id
        """,
        session_id,
    )
    if not updated:
        return {"status": "already_running", "session_id": session_id}

    asyncio.create_task(_run_analysis_in_background(session_id))
    return {"status": "started", "session_id": session_id}


async def _run_analysis_in_background(session_id: str) -> None:
    try:
        await _analyze_session_impl(session_id, allowed_statuses=("analyzing",))
        logger.info("Background analysis completed for session %s", session_id)
    except Exception as exc:
        logger.error(
            "Background analysis failed for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        try:
            pool = await _get_pool()
            await pool.execute(
                "UPDATE sessions SET status = 'completed' WHERE id = $1 AND status = 'analyzing'",
                session_id,
            )
        except Exception as status_exc:
            logger.error(
                "Failed to restore completed status for session %s: %s",
                session_id,
                status_exc,
                exc_info=True,
            )


@router.post("")
async def analyze_session(request: AnalyzeRequest) -> dict:
    return await _analyze_session_impl(
        request.session_id,
        allowed_statuses=("completed", "active"),
    )


async def _analyze_session_impl(
    session_id: str,
    allowed_statuses: tuple[str, ...],
) -> dict:
    """Analyze a candidate's terminal interaction session.

    Pipeline:
    1. Fetch session, challenge, and interaction data from the database.
    2. Parse the raw interactions into a clean transcript.
    3. Quality gate — reject transcripts with insufficient data.
    4. Two-pass Gemini analysis (extract observations → score).
    5. Evidence verification — flag fabricated citations.
    6. Validate and normalize scores.
    7. Persist results to the database.
    8. Return the analysis.
    """
    logger.info("Starting analysis for session: %s", session_id)

    # -- Step 1: Fetch data from the database --
    pool = await _get_pool()

    session = await _fetch_session(pool, session_id)

    # Verify session is in a valid state for analysis
    if session["status"] not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Session '{session_id}' has status '{session['status']}'. "
                f"Only {', '.join(repr(s) for s in allowed_statuses)} sessions can be analyzed."
            ),
        )

    # Check if already analyzed
    existing = await pool.fetchrow(
        "SELECT id FROM analysis_results WHERE session_id = $1", session_id
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Session '{session_id}' has already been analyzed. "
                f"Analysis ID: {existing['id']}"
            ),
        )

    challenge = await _fetch_challenge(pool, session["challenge_id"])
    interactions = await _fetch_interactions(pool, session_id)

    if not interactions:
        raise HTTPException(
            status_code=400,
            detail=f"No interactions found for session '{session_id}'",
        )

    logger.info(
        "Fetched %d interactions for session %s (challenge: %s)",
        len(interactions),
        session_id,
        challenge.get("title", "unknown"),
    )

    try:
        # -- Step 2: Parse transcript --
        parser = TranscriptParser()
        transcript = parser.parse(interactions)
        logger.info("Parsed transcript: %d characters", len(transcript))

        # -- Step 3: Quality gate --
        quality_gate = TranscriptQualityGate()
        insufficient_result = quality_gate.assess(interactions, transcript)

        if insufficient_result is not None:
            logger.warning(
                "Quality gate FAILED for session %s — using canned result",
                session_id,
            )
            analysis = insufficient_result
        else:
            # -- Step 4: Two-pass Gemini analysis --
            def _fmt_dt(dt) -> str:
                if dt is None:
                    return "Unknown"
                try:
                    return dt.strftime("%d/%m/%Y %H:%M:%S")
                except AttributeError:
                    return str(dt)

            session_metadata = {
                "Candidate Name": session.get("candidate_name", "Unknown"),
                "Candidate Email": session.get("candidate_email", "Unknown"),
                "Challenge Title": challenge.get("title", "Unknown"),
                "Time Limit (minutes)": challenge.get("time_limit_min", "Unknown"),
                "Session Started": _fmt_dt(session.get("started_at")),
                "Session Ended": _fmt_dt(session.get("ended_at")),
                "Total Interactions": len(interactions),
            }

            analyzer = ClaudeAnalyzer()
            raw_analysis = await asyncio.to_thread(
                analyzer.analyze,
                challenge_description=challenge.get("description", ""),
                session_metadata=session_metadata,
                transcript=transcript,
                challenge_role=challenge.get("role") or None,
                challenge_tech_stack=challenge.get("tech_stack") or None,
                challenge_seniority=challenge.get("seniority") or None,
                challenge_focus_areas=challenge.get("focus_areas") or None,
                challenge_context=challenge.get("context") or None,
            )
            logger.info("Gemini two-pass analysis complete")

            # -- Step 5: Evidence verification --
            verifier = EvidenceVerifier(transcript)
            raw_analysis = verifier.verify(raw_analysis)
            logger.info(
                "Evidence verification: %.1f%% verified",
                raw_analysis.get("_evidence_verification", {}).get(
                    "verification_rate_pct", 0
                ),
            )

            # -- Step 6: Validate and normalize scores --
            calculator = ScoreCalculator()
            analysis = calculator.calculate(raw_analysis)

        logger.info(
            "Score calculation complete: overall=%.1f", analysis["overall_score"]
        )

        # -- Step 7: Persist to database --
        report_gen = ReportGenerator(pool)
        analysis_id = await report_gen.save(session_id=session_id, analysis=analysis)
        logger.info("Analysis saved with ID: %s", analysis_id)

        # -- Step 7b: Record Gemini cost event --
        gemini_usage = analysis.get("_gemini_usage")
        if gemini_usage:
            company_id = challenge.get("company_id")
            input_tokens = gemini_usage.get("input_tokens", 0)
            output_tokens = gemini_usage.get("output_tokens", 0)
            cost_usd = (input_tokens / 1_000_000) * 0.15 + (output_tokens / 1_000_000) * 0.60
            try:
                await pool.execute(
                    """
                    INSERT INTO usage_events
                        (session_id, company_id, provider, event_type,
                         input_tokens, output_tokens, model, cost_usd, metadata)
                    VALUES ($1, $2, 'gemini', 'api_call', $3, $4, $5, $6, $7)
                    """,
                    session_id,
                    company_id,
                    input_tokens,
                    output_tokens,
                    gemini_usage.get("model", "gemini-2.5-flash"),
                    cost_usd,
                    json.dumps({
                        "pass1_input": gemini_usage.get("pass1_input", 0),
                        "pass1_output": gemini_usage.get("pass1_output", 0),
                        "pass2_input": gemini_usage.get("pass2_input", 0),
                        "pass2_output": gemini_usage.get("pass2_output", 0),
                    }),
                )
                logger.info(
                    "Recorded Gemini cost event: $%.6f (%d in / %d out tokens)",
                    cost_usd, input_tokens, output_tokens,
                )
            except Exception as cost_err:
                logger.warning("Failed to record Gemini cost event: %s", cost_err)

        # -- Step 8: Build and return response --
        response = {k: v for k, v in analysis.items() if not k.startswith("_")}
        response["analysis_id"] = analysis_id
        response["session_id"] = session_id

        return response

    except ValueError as exc:
        logger.error("Analysis failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error(
            "Unexpected error during analysis of session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(exc))
