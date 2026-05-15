import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { databaseUnavailableResponse, isDatabaseConnectionError } from '@/lib/api-errors';
import type { SessionWithChallenge } from '@/types';

type CandidateSessionWithChallenge = Omit<
  SessionWithChallenge,
  'decision_label' | 'recruiter_notes' | 'reviewed_by_email' | 'reviewed_by_name' | 'reviewed_at'
>;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<CandidateSessionWithChallenge[]>`
      SELECT
        s.id, s.challenge_id, s.candidate_name, s.candidate_email, s.token, s.status,
        s.started_at, s.ended_at, s.created_at, s.workspace_snapshot,
        c.title as challenge_title, c.description as challenge_description, c.time_limit_min
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    if (isDatabaseConnectionError(error)) return databaseUnavailableResponse();
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
