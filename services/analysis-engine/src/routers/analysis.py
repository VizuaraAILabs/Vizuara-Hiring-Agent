from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import uuid
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, HTTPException

from ..models.schemas import AnalyzeRequest
from ..services.claude_analyzer import (
    AnalysisTimeoutError,
    ClaudeAnalyzer,
    is_timeout_exception,
)
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
_pool_lock = asyncio.Lock()
_analysis_workers: list[asyncio.Task] = []
_WORKER_INSTANCE_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
_DEFAULT_GEMINI_INPUT_RATE = Decimal("0.15")
_DEFAULT_GEMINI_OUTPUT_RATE = Decimal("0.60")
_TOKENS_PER_MILLION = Decimal("1000000")


def _error_payload(
    code: str,
    message: str,
    *,
    retryable: bool = False,
    metadata: dict | None = None,
) -> dict:
    payload = {
        "code": code,
        "message": message,
        "retryable": retryable,
    }
    if metadata:
        payload["metadata"] = metadata
    return {"error": payload}


def _raise_analysis_error(
    status_code: int,
    code: str,
    message: str,
    *,
    retryable: bool = False,
    metadata: dict | None = None,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=_error_payload(
            code,
            message,
            retryable=retryable,
            metadata=metadata,
        ),
    )


def _analysis_max_concurrent() -> int:
    raw_value = os.environ.get("ANALYSIS_MAX_CONCURRENT", "2")
    try:
        return max(1, int(raw_value))
    except ValueError:
        logger.warning(
            "Invalid ANALYSIS_MAX_CONCURRENT=%r; defaulting to 2",
            raw_value,
        )
        return 2


def _analysis_poll_interval_seconds() -> float:
    raw_value = os.environ.get("ANALYSIS_QUEUE_POLL_SECONDS", "2")
    try:
        return max(0.2, float(raw_value))
    except ValueError:
        logger.warning(
            "Invalid ANALYSIS_QUEUE_POLL_SECONDS=%r; defaulting to 2",
            raw_value,
        )
        return 2


def _analysis_lease_seconds() -> int:
    raw_value = os.environ.get("ANALYSIS_JOB_LEASE_SECONDS", "300")
    try:
        return max(30, int(raw_value))
    except ValueError:
        logger.warning(
            "Invalid ANALYSIS_JOB_LEASE_SECONDS=%r; defaulting to 300",
            raw_value,
        )
        return 300


def _analysis_db_connect_timeout_seconds() -> float:
    return _env_timeout_seconds(
        "ANALYSIS_DB_CONNECT_TIMEOUT_SECONDS",
        default=10.0,
        minimum=1.0,
    )


def _analysis_db_command_timeout_seconds() -> float:
    return _env_timeout_seconds(
        "ANALYSIS_DB_COMMAND_TIMEOUT_SECONDS",
        default=30.0,
        minimum=1.0,
    )


def _analysis_db_close_timeout_seconds() -> float:
    return _env_timeout_seconds(
        "ANALYSIS_DB_CLOSE_TIMEOUT_SECONDS",
        default=10.0,
        minimum=1.0,
    )


def _env_timeout_seconds(name: str, default: float, minimum: float) -> float:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        return max(minimum, float(raw_value))
    except ValueError:
        logger.warning("Invalid %s=%r; defaulting to %.1f", name, raw_value, default)
        return default


def _analysis_session_timeout_seconds() -> float:
    return _env_timeout_seconds(
        "ANALYSIS_SESSION_TIMEOUT_SECONDS",
        default=240.0,
        minimum=10.0,
    )


def _analysis_enrichment_timeout_seconds() -> float:
    return _env_timeout_seconds(
        "ANALYSIS_ENRICHMENT_TIMEOUT_SECONDS",
        default=75.0,
        minimum=10.0,
    )


def _analysis_narrative_timeout_seconds() -> float:
    return _env_timeout_seconds(
        "ANALYSIS_NARRATIVE_TIMEOUT_SECONDS",
        default=105.0,
        minimum=10.0,
    )


async def _run_blocking_with_timeout(
    func,
    *,
    timeout_seconds: float,
    phase: str,
    **kwargs,
):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(func, **kwargs),
            timeout=timeout_seconds,
        )
    except AnalysisTimeoutError:
        raise
    except asyncio.TimeoutError as exc:
        raise AnalysisTimeoutError(
            f"{phase} timed out after {timeout_seconds:.1f} seconds",
            phase=phase,
            timeout_ms=int(timeout_seconds * 1000),
        ) from exc


async def _get_pool() -> asyncpg.Pool:
    """Get or create the asyncpg connection pool."""
    global _pool
    if _pool is not None:
        return _pool

    async with _pool_lock:
        if _pool is not None:
            return _pool

        connect_timeout = _analysis_db_connect_timeout_seconds()
        command_timeout = _analysis_db_command_timeout_seconds()
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            timeout=connect_timeout,
            command_timeout=command_timeout,
        )
        logger.info(
            "Created analysis DB pool with connect_timeout=%.1fs command_timeout=%.1fs",
            connect_timeout,
            command_timeout,
        )
    return _pool


async def close_analysis_pool() -> None:
    """Close the asyncpg pool during application shutdown."""
    global _pool
    async with _pool_lock:
        if _pool is None:
            return

        pool = _pool
        _pool = None

    close_timeout = _analysis_db_close_timeout_seconds()
    try:
        await asyncio.wait_for(pool.close(), timeout=close_timeout)
        logger.info("Closed analysis DB pool")
    except asyncio.TimeoutError:
        logger.warning(
            "Timed out after %.1fs while closing analysis DB pool; terminating connections",
            close_timeout,
        )
        pool.terminate()


async def start_analysis_queue_workers() -> None:
    """Start bounded workers for the Postgres-backed analysis queue."""
    if _analysis_workers:
        return

    worker_count = _analysis_max_concurrent()
    for worker_id in range(worker_count):
        _analysis_workers.append(
            asyncio.create_task(_analysis_worker_loop(worker_id + 1))
        )

    logger.info("Started %d analysis queue worker(s)", worker_count)
    await _recover_pending_analysis_sessions()


async def stop_analysis_queue_workers() -> None:
    """Stop analysis queue workers during application shutdown."""
    for worker in _analysis_workers:
        worker.cancel()

    if _analysis_workers:
        await asyncio.gather(*_analysis_workers, return_exceptions=True)

    _analysis_workers.clear()
    logger.info("Stopped analysis queue workers")


async def _recover_pending_analysis_sessions() -> None:
    """Ensure pending sessions have durable queue jobs after a restart."""
    pool = await _get_pool()
    rows = await pool.fetch(
        """
        INSERT INTO analysis_jobs (session_id, status)
        SELECT s.id, 'queued'
        FROM sessions s
        LEFT JOIN analysis_results ar ON ar.session_id = s.id
        WHERE s.status IN ('queued', 'analyzing') AND ar.id IS NULL
        ON CONFLICT (session_id) DO UPDATE
        SET
            status = CASE
                WHEN analysis_jobs.status IN ('succeeded', 'failed') THEN 'queued'
                ELSE analysis_jobs.status
            END,
            updated_at = NOW()
        RETURNING session_id
        """
    )

    if rows:
        logger.info("Recovered %d pending analysis job(s)", len(rows))


async def _enqueue_analysis(session_id: str) -> bool:
    pool = await _get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO analysis_jobs (
            session_id,
            status,
            claimed_by,
            claimed_at,
            lease_expires_at,
            last_error
        )
        VALUES ($1, 'queued', NULL, NULL, NULL, NULL)
        ON CONFLICT (session_id) DO UPDATE
        SET
            status = 'queued',
            claimed_by = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE analysis_jobs.status IN ('queued', 'failed', 'succeeded')
           OR analysis_jobs.lease_expires_at <= NOW()
        RETURNING status
        """,
        session_id,
    )
    queued = row is not None
    if queued:
        logger.info("Queued analysis job for session %s", session_id)
    return queued


async def _claim_next_analysis_job(worker_id: int) -> asyncpg.Record | None:
    pool = await _get_pool()
    worker_name = f"{_WORKER_INSTANCE_ID}:worker-{worker_id}"
    lease_seconds = _analysis_lease_seconds()
    return await pool.fetchrow(
        """
        WITH next_job AS (
            SELECT j.id
            FROM analysis_jobs j
            WHERE (
                j.status = 'queued'
                OR (j.status = 'running' AND j.lease_expires_at <= NOW())
            )
              AND NOT EXISTS (
                  SELECT 1 FROM analysis_results ar WHERE ar.session_id = j.session_id
              )
            ORDER BY j.created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE analysis_jobs j
        SET
            status = 'running',
            claimed_by = $1,
            claimed_at = NOW(),
            lease_expires_at = NOW() + ($2 * INTERVAL '1 second'),
            attempt_count = attempt_count + 1,
            updated_at = NOW()
        FROM next_job
        WHERE j.id = next_job.id
        RETURNING j.id, j.session_id, j.attempt_count, j.claimed_by
        """,
        worker_name,
        lease_seconds,
    )


async def _heartbeat_analysis_job(job_id: str, claimed_by: str) -> None:
    pool = await _get_pool()
    lease_seconds = _analysis_lease_seconds()
    interval_seconds = max(5, lease_seconds / 2)
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await pool.execute(
                """
                UPDATE analysis_jobs
                SET lease_expires_at = NOW() + ($3 * INTERVAL '1 second'),
                    updated_at = NOW()
                WHERE id = $1 AND claimed_by = $2 AND status = 'running'
                """,
                job_id,
                claimed_by,
                lease_seconds,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "Failed to heartbeat analysis job %s claimed by %s",
                job_id,
                claimed_by,
                exc_info=True,
            )


async def _mark_analysis_job_succeeded(job_id: str, claimed_by: str) -> None:
    pool = await _get_pool()
    await pool.execute(
        """
        UPDATE analysis_jobs
        SET status = 'succeeded',
            claimed_by = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL,
            updated_at = NOW()
        WHERE id = $1 AND claimed_by = $2
        """,
        job_id,
        claimed_by,
    )


async def _mark_analysis_job_succeeded_for_session(session_id: str) -> None:
    pool = await _get_pool()
    await pool.execute(
        """
        UPDATE analysis_jobs
        SET status = 'succeeded',
            claimed_by = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL,
            updated_at = NOW()
        WHERE session_id = $1
        """,
        session_id,
    )


async def _mark_analysis_job_failed(
    job_id: str,
    claimed_by: str,
    error_message: str,
) -> None:
    pool = await _get_pool()
    await pool.execute(
        """
        UPDATE analysis_jobs
        SET status = 'failed',
            claimed_by = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL,
            last_error = $3,
            updated_at = NOW()
        WHERE id = $1 AND claimed_by = $2
        """,
        job_id,
        claimed_by,
        error_message,
    )


async def _analysis_worker_loop(worker_id: int) -> None:
    logger.info("Analysis queue worker %d started", worker_id)
    while True:
        try:
            job = await _claim_next_analysis_job(worker_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Analysis worker %d failed to claim a job", worker_id)
            await asyncio.sleep(_analysis_poll_interval_seconds())
            continue

        if job is None:
            await asyncio.sleep(_analysis_poll_interval_seconds())
            continue

        job_id = str(job["id"])
        session_id = str(job["session_id"])
        claimed_by = str(job["claimed_by"])
        heartbeat_task = asyncio.create_task(
            _heartbeat_analysis_job(job_id, claimed_by)
        )
        try:
            logger.info("Analysis worker %d processing session %s", worker_id, session_id)
            if not await _mark_analysis_running(session_id):
                logger.info(
                    "Analysis worker %d skipped session %s because it is no longer claimable",
                    worker_id,
                    session_id,
                )
                await _mark_analysis_job_succeeded(job_id, claimed_by)
                continue
            succeeded = await _run_analysis_in_background(session_id)
            if succeeded:
                await _mark_analysis_job_succeeded(job_id, claimed_by)
            else:
                await _mark_analysis_job_failed(
                    job_id,
                    claimed_by,
                    "Analysis failed; see analysis_failures for details.",
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception(
                "Unexpected analysis worker error for session %s",
                session_id,
            )
            try:
                await _mark_analysis_job_failed(job_id, claimed_by, str(exc))
            except Exception:
                logger.exception("Failed to mark analysis job %s as failed", job_id)
        finally:
            heartbeat_task.cancel()
            await asyncio.gather(heartbeat_task, return_exceptions=True)


async def _mark_analysis_running(session_id: str) -> bool:
    pool = await _get_pool()
    row = await pool.fetchrow(
        """
        UPDATE sessions
        SET status = 'analyzing'
        WHERE id = $1
          AND status IN ('queued', 'analyzing')
          AND NOT EXISTS (
              SELECT 1 FROM analysis_results WHERE session_id = $1
          )
        RETURNING id
        """,
        session_id,
    )
    return row is not None


async def _analysis_result_exists(pool: asyncpg.Pool, session_id: str) -> bool:
    row = await pool.fetchrow(
        "SELECT id FROM analysis_results WHERE session_id = $1",
        session_id,
    )
    return row is not None


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


async def _fetch_gemini_cost_rates(
    pool: asyncpg.Pool,
    company_id: str | None,
) -> tuple[Decimal, Decimal, str]:
    """Fetch Gemini token rates in USD per million tokens for a company."""
    if not company_id:
        return _DEFAULT_GEMINI_INPUT_RATE, _DEFAULT_GEMINI_OUTPUT_RATE, "default"

    row = await pool.fetchrow(
        """
        SELECT gemini_input_rate, gemini_output_rate
        FROM cost_settings
        WHERE company_id = $1
        """,
        company_id,
    )
    if not row:
        return _DEFAULT_GEMINI_INPUT_RATE, _DEFAULT_GEMINI_OUTPUT_RATE, "default"

    return (
        Decimal(str(row["gemini_input_rate"])),
        Decimal(str(row["gemini_output_rate"])),
        "company",
    )


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
        _raise_analysis_error(
            404,
            "analysis_not_found",
            "No analysis report exists for this session yet.",
            retryable=False,
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
        _raise_analysis_error(
            400,
            "no_interactions",
            "No session activity was found to enrich.",
            retryable=False,
        )

    try:
        parser = TranscriptParser()
        transcript = parser.parse(interactions)
        logger.info("Parsed transcript for enrichment: %d characters", len(transcript))

        analyzer = ClaudeAnalyzer()
        enrichment = await _run_blocking_with_timeout(
            analyzer.enrich_dimension_evidence,
            timeout_seconds=_analysis_enrichment_timeout_seconds(),
            phase="dimension_enrichment",
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

        verified_details = EvidenceVerifier(transcript).verify(
            {"dimensions": dimension_details}
        )
        dimension_details = verified_details.get("dimensions", dimension_details)

        await pool.execute(
            "UPDATE analysis_results SET dimension_details = $1::jsonb WHERE session_id = $2",
            _json.dumps(dimension_details),
            session_id,
        )
        logger.info("Dimension evidence saved for session %s", session_id)

        return {"dimension_details": dimension_details}

    except AnalysisTimeoutError as exc:
        logger.error(
            "Dimension enrichment timed out for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=504,
            detail=_error_payload(
                "analysis_timeout",
                "Detailed evidence generation timed out. Please retry.",
                retryable=True,
                metadata={
                    "phase": getattr(exc, "phase", "dimension_enrichment"),
                    "timeout_ms": getattr(exc, "timeout_ms", None),
                },
            ),
        )
    except Exception as exc:
        logger.error(
            "Failed to enrich dimensions for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=_error_payload(
                "dimension_enrichment_error",
                "Detailed evidence generation failed. Please retry or contact support.",
                retryable=True,
            ),
        )


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
        _raise_analysis_error(
            404,
            "analysis_not_found",
            "No analysis report exists for this session yet.",
            retryable=False,
        )
    if existing["transcript_narrative"]:
        logger.info("Returning cached transcript narrative for session %s", session_id)
        return {"transcript_narrative": existing["transcript_narrative"]}

    # Fetch session and challenge for metadata
    session = await _fetch_session(pool, session_id)
    challenge = await _fetch_challenge(pool, session["challenge_id"])
    interactions = await _fetch_interactions(pool, session_id)

    if not interactions:
        _raise_analysis_error(
            400,
            "no_interactions",
            "No session activity was found to summarize.",
            retryable=False,
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
        narrative = await _run_blocking_with_timeout(
            analyzer.generate_transcript_narrative,
            timeout_seconds=_analysis_narrative_timeout_seconds(),
            phase="transcript_narrative",
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

    except AnalysisTimeoutError as exc:
        logger.error(
            "Transcript narrative timed out for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=504,
            detail=_error_payload(
                "analysis_timeout",
                "Transcript narrative generation timed out. Please retry.",
                retryable=True,
                metadata={
                    "phase": getattr(exc, "phase", "transcript_narrative"),
                    "timeout_ms": getattr(exc, "timeout_ms", None),
                },
            ),
        )
    except Exception as exc:
        logger.error(
            "Failed to generate transcript narrative for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=_error_payload(
                "transcript_narrative_error",
                "Transcript narrative generation failed. Please retry or contact support.",
                retryable=True,
            ),
        )


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
        await _mark_analysis_job_succeeded_for_session(session_id)
        return {
            "status": "already_analyzed",
            "analysis_id": str(existing["id"]),
            "session_id": session_id,
        }

    if session["status"] in ("queued", "analyzing"):
        queued = await _enqueue_analysis(session_id)
        return {
            "status": "queued" if queued else "already_running",
            "session_id": session_id,
        }

    if session["status"] not in ("completed", "analysis failed"):
        _raise_analysis_error(
            400,
            "invalid_session_status",
            "This session is not ready for analysis.",
            retryable=False,
            metadata={"status": session["status"]},
        )

    updated = await pool.fetchrow(
        """
        UPDATE sessions
        SET status = 'queued'
        WHERE id = $1 AND status IN ('completed', 'analysis failed')
        RETURNING id
        """,
        session_id,
    )
    if not updated:
        return {"status": "already_running", "session_id": session_id}

    queued = await _enqueue_analysis(session_id)
    return {
        "status": "queued" if queued else "already_running",
        "session_id": session_id,
    }


async def _run_analysis_in_background(session_id: str) -> bool:
    try:
        await _analyze_session_impl(session_id, allowed_statuses=("analyzing",))
        logger.info("Background analysis completed for session %s", session_id)
        return True
    except Exception as exc:
        logger.error(
            "Background analysis failed for session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        try:
            pool = await _get_pool()
            if await _analysis_result_exists(pool, session_id):
                logger.info(
                    "Analysis result already exists for session %s after failure; treating job as complete",
                    session_id,
                )
                return True
            await _mark_analysis_failed(pool, session_id, exc)
        except Exception as status_exc:
            logger.error(
                "Failed to mark analysis failed for session %s: %s",
                session_id,
                status_exc,
                exc_info=True,
            )
        return False


async def _mark_analysis_failed(
    pool: asyncpg.Pool,
    session_id: str,
    exc: Exception,
) -> None:
    error_code = "analysis_error"
    error_message = str(exc)
    extra_metadata: dict = {}
    status_code = getattr(exc, "status_code", None)
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict):
        detail_error = detail.get("error")
        if isinstance(detail_error, dict):
            error_code = str(detail_error.get("code") or error_code)
            error_message = str(detail_error.get("message") or error_message)
            detail_metadata = detail_error.get("metadata")
            if isinstance(detail_metadata, dict):
                extra_metadata.update(detail_metadata)

    if is_timeout_exception(exc):
        error_code = "analysis_timeout"
    elif status_code is not None:
        error_code = error_code if error_code != "analysis_error" else f"http_{status_code}"

    await pool.execute(
        """
        INSERT INTO analysis_failures (
            session_id,
            error_code,
            error_message,
            error_metadata
        ) VALUES ($1, $2, $3, $4::jsonb)
        """,
        session_id,
        error_code,
        error_message,
        json.dumps({
            "exception_type": exc.__class__.__name__,
            "status_code": status_code,
            "phase": getattr(exc, "phase", None),
            "timeout_ms": getattr(exc, "timeout_ms", None),
            **extra_metadata,
        }),
    )
    await pool.execute(
        """
        UPDATE sessions
        SET status = 'analysis failed'
        WHERE id = $1 AND status IN ('completed', 'queued', 'analyzing', 'analysis failed')
        """,
        session_id,
    )


@router.post("")
async def analyze_session(request: AnalyzeRequest) -> dict:
    try:
        return await _analyze_session_impl(
            request.session_id,
            allowed_statuses=("completed", "analysis failed"),
        )
    except AnalysisTimeoutError as exc:
        try:
            pool = await _get_pool()
            if not await _analysis_result_exists(pool, request.session_id):
                await _mark_analysis_failed(pool, request.session_id, exc)
        except Exception:
            logger.exception(
                "Failed to record direct analysis timeout for session %s",
                request.session_id,
            )
        raise HTTPException(
            status_code=504,
            detail=_error_payload(
                "analysis_timeout",
                "Analysis timed out while generating the report. Please retry.",
                retryable=True,
                metadata={
                    "phase": getattr(exc, "phase", "session_analysis"),
                    "timeout_ms": getattr(exc, "timeout_ms", None),
                },
            ),
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
        _raise_analysis_error(
            400,
            "invalid_session_status",
            "This session is not ready for analysis.",
            retryable=False,
            metadata={
                "status": session["status"],
                "allowed_statuses": list(allowed_statuses),
            },
        )

    # Check if already analyzed
    existing = await pool.fetchrow(
        "SELECT id FROM analysis_results WHERE session_id = $1", session_id
    )
    if existing:
        _raise_analysis_error(
            409,
            "already_analyzed",
            "This session has already been analyzed.",
            retryable=False,
            metadata={"analysis_id": str(existing["id"])},
        )

    challenge = await _fetch_challenge(pool, session["challenge_id"])
    interactions = await _fetch_interactions(pool, session_id)

    if not interactions:
        _raise_analysis_error(
            400,
            "no_interactions",
            "No session activity was found to analyze.",
            retryable=False,
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
        parsed_transcript = parser.parse_with_turns(interactions)
        transcript = parsed_transcript.transcript
        logger.info("Parsed transcript: %d characters", len(transcript))

        # -- Step 3: Quality gate --
        quality_gate = TranscriptQualityGate()
        insufficient_result = quality_gate.assess(
            interactions,
            transcript,
            parsed_turns=parsed_transcript.turns,
        )

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
            raw_analysis = await _run_blocking_with_timeout(
                analyzer.analyze,
                timeout_seconds=_analysis_session_timeout_seconds(),
                phase="session_analysis",
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
            try:
                input_rate, output_rate, rate_source = await _fetch_gemini_cost_rates(
                    pool,
                    company_id,
                )
                cost_usd = (
                    Decimal(input_tokens) / _TOKENS_PER_MILLION * input_rate
                    + Decimal(output_tokens) / _TOKENS_PER_MILLION * output_rate
                )
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
                        "input_rate_per_million": float(input_rate),
                        "output_rate_per_million": float(output_rate),
                        "cost_settings_source": rate_source,
                    }),
                )
                logger.info(
                    "Recorded Gemini cost event: $%.6f (%d in / %d out tokens)",
                    float(cost_usd), input_tokens, output_tokens,
                )
            except Exception as cost_err:
                logger.warning("Failed to record Gemini cost event: %s", cost_err)

        # -- Step 8: Build and return response --
        response = {k: v for k, v in analysis.items() if not k.startswith("_")}
        response["analysis_id"] = analysis_id
        response["session_id"] = session_id

        return response

    except AnalysisTimeoutError as exc:
        logger.error("Analysis timed out for session %s: %s", session_id, exc)
        raise
    except ValueError as exc:
        logger.error("Analysis failed for session %s: %s", session_id, exc)
        raise HTTPException(
            status_code=502,
            detail=_error_payload(
                "model_response_invalid",
                "The analysis provider returned an invalid response. Please retry.",
                retryable=True,
            ),
        )
    except Exception as exc:
        logger.error(
            "Unexpected error during analysis of session %s: %s",
            session_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=_error_payload(
                "analysis_error",
                "Analysis failed. Please retry or contact support.",
                retryable=True,
            ),
        )
