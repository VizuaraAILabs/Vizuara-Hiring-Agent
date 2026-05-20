import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { databaseUnavailableResponse, isDatabaseConnectionError } from '@/lib/api-errors';
import { candidateUnavailablePayload } from '@/lib/candidate-unavailable';
import { validateChallengeAccess } from '@/lib/challenge-access';
import type { Session, SessionWithChallenge } from '@/types';

type CandidateSessionWithChallenge = Omit<
  SessionWithChallenge,
  'decision_label' | 'recruiter_notes' | 'reviewed_by_email' | 'reviewed_by_name' | 'reviewed_at'
>;

type CandidateSessionUpdate = Pick<
  Session,
  'id' | 'challenge_id' | 'candidate_name' | 'candidate_email' | 'token' | 'status' | 'started_at' | 'ended_at' | 'created_at' | 'workspace_snapshot' | 'candidate_lifecycle_status' | 'invite_email_status'
>;

const COMPLETION_STATUSES = new Set(['completed', 'queued', 'analyzing', 'analyzed', 'analysis failed']);

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<CandidateSessionWithChallenge[]>`
      SELECT
        s.id, s.challenge_id, s.candidate_name, s.candidate_email, s.token, s.status,
        s.started_at, s.ended_at, s.created_at, s.workspace_snapshot,
        s.candidate_lifecycle_status, s.candidate_lifecycle_reason, s.invite_email_status,
        s.candidate_lifecycle_updated_at, s.candidate_lifecycle_updated_by_email,
        c.title as challenge_title, c.description as challenge_description,
        c.time_limit_min, c.company_id as challenge_company_id, c.is_active as challenge_is_active,
        c.starts_at as challenge_starts_at, c.ends_at as challenge_ends_at,
        c.sessions_limit as challenge_sessions_limit, c.allowed_emails as challenge_allowed_emails
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json(candidateUnavailablePayload('invalid_link'), { status: 404 });
    }
    if (session.candidate_lifecycle_status) {
      return NextResponse.json(candidateUnavailablePayload('revoked'), { status: 403 });
    }
    if (session.invite_email_status === 'sending') {
      return NextResponse.json(candidateUnavailablePayload('invite_preparing'), { status: 409 });
    }

    if (session.status !== 'pending') {
      const reason = COMPLETION_STATUSES.has(session.status) ? 'already_submitted' : 'already_started';
      return NextResponse.json(candidateUnavailablePayload(reason), { status: 400 });
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
      cohort_label: null,
      archived_at: null,
      created_at: session.created_at,
    }, {
      candidateEmail: session.candidate_email,
      enforceEmailAllowlist: true,
    });
    if (!access.ok) {
      return NextResponse.json(candidateUnavailablePayload(access.reason), { status: access.status });
    }

    const [updated] = await sql<CandidateSessionUpdate[]>`
      UPDATE sessions
      SET status = 'active'
      WHERE id = ${session.id}
        AND status = 'pending'
        AND candidate_lifecycle_status IS NULL
        AND COALESCE(invite_email_status, 'not_sent') <> 'sending'
      RETURNING
        id, challenge_id, candidate_name, candidate_email, token, status,
        started_at, ended_at, created_at, workspace_snapshot, candidate_lifecycle_status, invite_email_status
    `;
    if (!updated) {
      return NextResponse.json(candidateUnavailablePayload('session_not_active'), { status: 409 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error starting session:', error);
    if (isDatabaseConnectionError(error)) return databaseUnavailableResponse();
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
