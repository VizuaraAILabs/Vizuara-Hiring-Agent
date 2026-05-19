import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { databaseUnavailableResponse, isDatabaseConnectionError } from '@/lib/api-errors';
import type { Session } from '@/types';

type CandidateSession = Pick<
  Session,
  'id' | 'challenge_id' | 'candidate_name' | 'candidate_email' | 'token' | 'status' | 'started_at' | 'ended_at' | 'created_at' | 'workspace_snapshot' | 'candidate_lifecycle_status'
>;

type CandidateSessionWithLimit = CandidateSession & {
  time_limit_min: number;
};

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<CandidateSessionWithLimit[]>`
      SELECT
        s.id, s.challenge_id, s.candidate_name, s.candidate_email, s.token, s.status,
        s.started_at, s.ended_at, s.created_at, s.workspace_snapshot, s.candidate_lifecycle_status,
        c.time_limit_min
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.candidate_lifecycle_status) {
      return NextResponse.json(
        { error: 'This assessment invite is no longer active. Please contact the company.' },
        { status: 403 }
      );
    }

    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 });
    }

    const now = Date.now();
    const startedAt = session.started_at ? new Date(session.started_at).getTime() : NaN;
    const deadline = Number.isFinite(startedAt)
      ? startedAt + (session.time_limit_min * 60 * 1000)
      : now;
    const effectiveEndedAt = new Date(Math.min(now, deadline)).toISOString();

    const [updated] = await sql<CandidateSession[]>`
      UPDATE sessions
      SET status = 'completed', ended_at = ${effectiveEndedAt}
      WHERE id = ${session.id}
      RETURNING
        id, challenge_id, candidate_name, candidate_email, token, status,
        started_at, ended_at, created_at, workspace_snapshot, candidate_lifecycle_status
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error ending session:', error);
    if (isDatabaseConnectionError(error)) return databaseUnavailableResponse();
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
