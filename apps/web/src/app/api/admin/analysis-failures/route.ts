import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

interface AdminAnalysisFailure {
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  session_status: string;
  session_ended_at: string | null;
  error_code: string | null;
  error_message: string | null;
  error_metadata: Record<string, unknown> | null;
  failed_at: string | null;
  failure_count: number;
  analysis_job_status: string | null;
  analysis_job_attempt_count: number | null;
  analysis_job_last_error: string | null;
  analysis_job_updated_at: string | null;
  interaction_count: number;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const failures = await sql<AdminAnalysisFailure[]>`
      WITH latest_failures AS (
        SELECT DISTINCT ON (session_id)
          session_id,
          error_code,
          error_message,
          error_metadata,
          created_at
        FROM analysis_failures
        ORDER BY session_id, created_at DESC
      ),
      failure_counts AS (
        SELECT session_id, COUNT(*)::int AS failure_count
        FROM analysis_failures
        GROUP BY session_id
      ),
      interaction_counts AS (
        SELECT session_id, COUNT(*)::int AS interaction_count
        FROM interactions
        GROUP BY session_id
      )
      SELECT
        s.id AS session_id,
        s.challenge_id,
        c.title AS challenge_title,
        co.name AS company_name,
        s.candidate_name,
        s.candidate_email,
        s.status AS session_status,
        s.ended_at AS session_ended_at,
        lf.error_code,
        lf.error_message,
        lf.error_metadata,
        lf.created_at AS failed_at,
        COALESCE(fc.failure_count, 0)::int AS failure_count,
        aj.status AS analysis_job_status,
        aj.attempt_count AS analysis_job_attempt_count,
        aj.last_error AS analysis_job_last_error,
        aj.updated_at AS analysis_job_updated_at,
        COALESCE(ic.interaction_count, 0)::int AS interaction_count
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      JOIN companies co ON co.id = c.company_id
      LEFT JOIN analysis_results ar ON ar.session_id = s.id
      LEFT JOIN analysis_jobs aj ON aj.session_id = s.id
      LEFT JOIN latest_failures lf ON lf.session_id = s.id
      LEFT JOIN failure_counts fc ON fc.session_id = s.id
      LEFT JOIN interaction_counts ic ON ic.session_id = s.id
      WHERE s.status = 'analysis failed'
        AND ar.id IS NULL
      ORDER BY COALESCE(lf.created_at, aj.updated_at, s.ended_at, s.created_at) DESC
      LIMIT 200
    `;

    return NextResponse.json({ failures });
  } catch (error) {
    console.error('Admin analysis failures error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
