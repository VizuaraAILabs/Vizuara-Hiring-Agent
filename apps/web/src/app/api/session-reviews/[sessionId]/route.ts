import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { DecisionLabel, Session } from '@/types';

const DECISION_LABELS = new Set<DecisionLabel>(['shortlisted', 'hold', 'reject', 'hired']);
const MAX_NOTES_LENGTH = 5000;

type SessionOwnershipRow = Session & {
  company_id: string;
};

function normalizeDecisionLabel(value: unknown): DecisionLabel | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Decision label must be a string.');
  if (!DECISION_LABELS.has(value as DecisionLabel)) {
    throw new Error('Decision label is not supported.');
  }
  return value as DecisionLabel;
}

function normalizeNotes(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('Notes must be a string.');

  const trimmed = value.trim();
  if (trimmed.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
  }

  return trimmed || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { sessionId } = await params;
    const [session] = await sql<SessionOwnershipRow[]>`
      SELECT s.*, c.company_id
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.id = ${sessionId}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    let decisionLabel: DecisionLabel | null;
    let recruiterNotes: string | null;

    try {
      decisionLabel = normalizeDecisionLabel(body.decision_label);
      recruiterNotes = normalizeNotes(body.recruiter_notes);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid review update.' },
        { status: 400 }
      );
    }

    const [updated] = await sql<Session[]>`
      UPDATE sessions
      SET
        decision_label = ${decisionLabel},
        recruiter_notes = ${recruiterNotes},
        reviewed_by_email = ${user.email},
        reviewed_by_name = ${user.name},
        reviewed_at = NOW()
      WHERE id = ${sessionId}
      RETURNING *
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating recruiter review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
