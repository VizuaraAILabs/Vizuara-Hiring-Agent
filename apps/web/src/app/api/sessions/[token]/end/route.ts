import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import type { Session } from '@/types';

type CandidateSession = Pick<
  Session,
  'id' | 'challenge_id' | 'candidate_name' | 'candidate_email' | 'token' | 'status' | 'started_at' | 'ended_at' | 'created_at' | 'workspace_snapshot'
>;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<CandidateSession[]>`
      SELECT
        id, challenge_id, candidate_name, candidate_email, token, status,
        started_at, ended_at, created_at, workspace_snapshot
      FROM sessions
      WHERE token = ${token}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const [updated] = await sql<CandidateSession[]>`
      UPDATE sessions
      SET status = 'completed', ended_at = ${now}
      WHERE id = ${session.id}
      RETURNING
        id, challenge_id, candidate_name, candidate_email, token, status,
        started_at, ended_at, created_at, workspace_snapshot
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error ending session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
