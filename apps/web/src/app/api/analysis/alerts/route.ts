import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const ANALYSIS_NOT_STARTED_AFTER_MINUTES = 5;
const QUEUED_TOO_LONG_MINUTES = 10;
const ANALYZING_TOO_LONG_MINUTES = 20;

type AnalysisAlertType =
  | 'analysis_not_started'
  | 'queued_too_long'
  | 'analyzing_too_long'
  | 'analysis_failed';

interface AnalysisAlert {
  id: string;
  alert_type: AnalysisAlertType;
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  candidate_name: string;
  candidate_email: string;
  session_status: string;
  event_at: string;
  minutes_waiting: number;
  retryable: boolean;
  last_error: string | null;
  analysis_job_status: string | null;
  analysis_job_attempt_count: number | null;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const alerts = await sql<AnalysisAlert[]>`
      WITH latest_failures AS (
        SELECT DISTINCT ON (session_id)
          session_id,
          error_message,
          created_at
        FROM analysis_failures
        ORDER BY session_id, created_at DESC
      ),
      alert_candidates AS (
        SELECT
          s.id AS session_id,
          s.challenge_id,
          c.title AS challenge_title,
          s.candidate_name,
          s.candidate_email,
          s.status AS session_status,
          aj.status AS analysis_job_status,
          aj.attempt_count AS analysis_job_attempt_count,
          COALESCE(aj.last_error, lf.error_message) AS last_error,
          CASE
            WHEN s.status = 'analysis failed' THEN 'analysis_failed'
            WHEN s.status = 'queued'
              AND COALESCE(aj.updated_at, s.ended_at, s.created_at) <= NOW() - (${QUEUED_TOO_LONG_MINUTES} * INTERVAL '1 minute')
              THEN 'queued_too_long'
            WHEN s.status = 'analyzing'
              AND COALESCE(aj.updated_at, s.ended_at, s.created_at) <= NOW() - (${ANALYZING_TOO_LONG_MINUTES} * INTERVAL '1 minute')
              THEN 'analyzing_too_long'
            WHEN s.status = 'completed'
              AND ar.id IS NULL
              AND COALESCE(s.ended_at, s.created_at) <= NOW() - (${ANALYSIS_NOT_STARTED_AFTER_MINUTES} * INTERVAL '1 minute')
              THEN 'analysis_not_started'
            ELSE NULL
          END AS alert_type,
          CASE
            WHEN s.status IN ('queued', 'analyzing') THEN COALESCE(aj.updated_at, s.ended_at, s.created_at)
            WHEN s.status = 'analysis failed' THEN COALESCE(lf.created_at, aj.updated_at, s.ended_at, s.created_at)
            ELSE COALESCE(s.ended_at, s.created_at)
          END AS event_at
        FROM sessions s
        JOIN challenges c ON c.id = s.challenge_id
        LEFT JOIN analysis_results ar ON ar.session_id = s.id
        LEFT JOIN analysis_jobs aj ON aj.session_id = s.id
        LEFT JOIN latest_failures lf ON lf.session_id = s.id
        WHERE c.company_id = ${user.companyId}
          AND s.status IN ('completed', 'queued', 'analyzing', 'analysis failed')
      )
      SELECT
        session_id::text || ':' || alert_type AS id,
        alert_type,
        session_id,
        challenge_id,
        challenge_title,
        candidate_name,
        candidate_email,
        session_status,
        event_at,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - event_at)) / 60)::int AS minutes_waiting,
        alert_type IN ('analysis_not_started', 'analysis_failed') AS retryable,
        last_error,
        analysis_job_status,
        analysis_job_attempt_count
      FROM alert_candidates
      WHERE alert_type IS NOT NULL
      ORDER BY
        CASE alert_type
          WHEN 'analysis_failed' THEN 1
          WHEN 'analyzing_too_long' THEN 2
          WHEN 'queued_too_long' THEN 3
          ELSE 4
        END,
        event_at ASC
      LIMIT 20
    `;

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching analysis alerts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
