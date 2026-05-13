import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { validateChallengeAccess } from '@/lib/challenge-access';
import type { Session, SessionWithChallenge } from '@/types';

type CandidateSessionWithChallenge = Omit<
  SessionWithChallenge,
  'decision_label' | 'recruiter_notes' | 'reviewed_by_email' | 'reviewed_by_name' | 'reviewed_at'
>;

type CandidateSessionUpdate = Pick<
  Session,
  'id' | 'challenge_id' | 'candidate_name' | 'candidate_email' | 'token' | 'status' | 'started_at' | 'ended_at' | 'created_at' | 'workspace_snapshot'
>;

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<CandidateSessionWithChallenge[]>`
      SELECT
        s.id, s.challenge_id, s.candidate_name, s.candidate_email, s.token, s.status,
        s.started_at, s.ended_at, s.created_at, s.workspace_snapshot,
        c.title as challenge_title, c.description as challenge_description,
        c.time_limit_min, c.company_id as challenge_company_id, c.is_active as challenge_is_active,
        c.starts_at as challenge_starts_at, c.ends_at as challenge_ends_at,
        c.sessions_limit as challenge_sessions_limit, c.allowed_emails as challenge_allowed_emails
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'pending') {
      return NextResponse.json({ error: 'Session has already been started' }, { status: 400 });
    }

    const access = await validateChallengeAccess({
      id: session.challenge_id,
      company_id: session.challenge_company_id ?? '',
      title: session.challenge_title,
      description: session.challenge_description,
      time_limit_min: session.time_limit_min,
      is_active: session.challenge_is_active ?? true,
      starter_files_dir: null,
      starter_files: null,
      sessions_limit: session.challenge_sessions_limit ?? null,
      allowed_emails: session.challenge_allowed_emails ?? null,
      starts_at: session.challenge_starts_at ?? null,
      ends_at: session.challenge_ends_at ?? null,
      role: null,
      tech_stack: null,
      seniority: null,
      focus_areas: null,
      context: null,
      created_at: session.created_at,
    }, {
      candidateEmail: session.candidate_email,
      enforceEmailAllowlist: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, reason: access.reason }, { status: access.status });
    }

    const [updated] = await sql<CandidateSessionUpdate[]>`
      UPDATE sessions
      SET status = 'active'
      WHERE id = ${session.id}
      RETURNING
        id, challenge_id, candidate_name, candidate_email, token, status,
        started_at, ended_at, created_at, workspace_snapshot
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error starting session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
