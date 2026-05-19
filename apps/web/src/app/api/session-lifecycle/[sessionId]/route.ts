import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { sendInviteEmail } from '@/lib/brevo';
import {
  DEFAULT_INVITE_EMAIL_BODY,
  DEFAULT_INVITE_EMAIL_SUBJECT,
  renderInviteEmailTemplate,
} from '@/lib/invite-email';
import { generateToken } from '@/lib/utils';
import type { CandidateLifecycleStatus, Session } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const LIFECYCLE_ACTIONS = new Set([
  'revoke',
  'regenerate_link',
  'send_invite_email',
  'mark_no_show',
  'mark_withdrawn',
  'mark_disqualified',
  'clear_lifecycle',
]);

type LifecycleAction =
  | 'revoke'
  | 'regenerate_link'
  | 'send_invite_email'
  | 'mark_no_show'
  | 'mark_withdrawn'
  | 'mark_disqualified'
  | 'clear_lifecycle';

type SessionLifecycleRow = Session & {
  company_id: string;
  challenge_title: string;
  challenge_time_limit_min: number;
  challenge_starts_at: string | null;
  challenge_ends_at: string | null;
  invite_email_subject: string | null;
  invite_email_body: string | null;
  company_name: string | null;
};

function normalizeAction(value: unknown): LifecycleAction {
  if (typeof value !== 'string' || !LIFECYCLE_ACTIONS.has(value)) {
    throw new Error('Lifecycle action is not supported.');
  }
  return value as LifecycleAction;
}

function normalizeReason(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('Reason must be a string.');

  const trimmed = value.trim();
  if (trimmed.length > 1000) {
    throw new Error('Reason must be 1000 characters or fewer.');
  }
  return trimmed || null;
}

function nextLifecycleStatus(action: LifecycleAction): CandidateLifecycleStatus | null {
  if (action === 'revoke') return 'revoked';
  if (action === 'mark_no_show') return 'no_show';
  if (action === 'mark_withdrawn') return 'withdrawn';
  if (action === 'mark_disqualified') return 'disqualified';
  return null;
}

function assertPendingUnstarted(session: SessionLifecycleRow, actionLabel: string) {
  if (session.status !== 'pending' || session.started_at) {
    throw new Error(`${actionLabel} is only available for pending candidates who have not started.`);
  }
}

async function writeLifecycleEvent(
  db: typeof sql,
  sessionId: string,
  action: LifecycleAction,
  previousValue: string | null | undefined,
  newValue: string | null | undefined,
  actorEmail: string,
  reason: string | null
) {
  await db`
    INSERT INTO session_lifecycle_events (
      id, session_id, action, previous_value, new_value, actor_email, reason
    )
    VALUES (
      ${uuidv4()}, ${sessionId}, ${action}, ${previousValue ?? null}, ${newValue ?? null}, ${actorEmail}, ${reason}
    )
  `;
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId && !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { sessionId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    let action: LifecycleAction;
    let reason: string | null;
    try {
      action = normalizeAction(body.action);
      reason = normalizeReason(body.reason);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid lifecycle action.' },
        { status: 400 }
      );
    }

    const [session] = await sql<SessionLifecycleRow[]>`
      SELECT
        s.*,
        c.company_id,
        c.title as challenge_title,
        c.time_limit_min as challenge_time_limit_min,
        c.starts_at as challenge_starts_at,
        c.ends_at as challenge_ends_at,
        c.invite_email_subject,
        c.invite_email_body,
        co.name as company_name
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE s.id = ${sessionId}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.company_id !== user.companyId && !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'send_invite_email') {
      try {
        assertPendingUnstarted(session, 'Sending invite email');
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid action.' }, { status: 400 });
      }
      if (session.candidate_lifecycle_status) {
        return NextResponse.json({ error: 'Clear the lifecycle status before emailing this invite.' }, { status: 400 });
      }

      const [sendableSession] = await sql<Session[]>`
        UPDATE sessions
        SET invite_email_status = 'sending',
            invite_email_error = NULL
        WHERE id = ${sessionId}
          AND status = 'pending'
          AND started_at IS NULL
          AND candidate_lifecycle_status IS NULL
          AND COALESCE(invite_email_status, 'not_sent') <> 'sending'
        RETURNING *
      `;
      if (!sendableSession) {
        return NextResponse.json({ error: 'Invite email is only available for pending candidates who have not started, and no send can already be in progress.' }, { status: 409 });
      }

      const origin = new URL(request.url).origin;
      const assessmentLink = `${origin}/session/${sendableSession.token}`;
      const companyName = session.company_name || 'ArcEval';
      const mergeData = {
        candidateName: session.candidate_name,
        challengeTitle: session.challenge_title,
        assessmentLink,
        timeLimitMin: session.challenge_time_limit_min,
        startsAt: session.challenge_starts_at,
        endsAt: session.challenge_ends_at,
        companyName,
      };
      const subject = renderInviteEmailTemplate(
        session.invite_email_subject || DEFAULT_INVITE_EMAIL_SUBJECT,
        mergeData
      );
      const bodyText = renderInviteEmailTemplate(
        session.invite_email_body || DEFAULT_INVITE_EMAIL_BODY,
        mergeData
      );

      try {
        await sendInviteEmail({
          to: session.candidate_email,
          toName: session.candidate_name,
          subject,
          bodyText,
          companyName,
          assessmentLink,
        });

        const [updated] = await sql<Session[]>`
          UPDATE sessions
          SET invite_email_status = 'sent',
              invite_email_sent_at = NOW(),
              invite_email_error = NULL
          WHERE id = ${sendableSession.id}
          RETURNING *
        `;
        await writeLifecycleEvent(sql, sessionId, action, session.invite_email_status, 'sent', user.email, reason);
        return NextResponse.json({ session: updated, invite_url: `/session/${updated.token}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send invite email';
        const [updated] = await sql<Session[]>`
          UPDATE sessions
          SET invite_email_status = 'failed',
              invite_email_error = ${message}
          WHERE id = ${sendableSession.id}
          RETURNING *
        `;
        await writeLifecycleEvent(sql, sessionId, action, session.invite_email_status, 'failed', user.email, reason);
        return NextResponse.json(
          { session: updated, invite_url: `/session/${updated.token}`, error: 'Email could not be sent. The invite link is still available to copy.' },
          { status: 502 }
        );
      }
    }

    if (action === 'regenerate_link') {
      try {
        assertPendingUnstarted(session, 'Regenerating invite links');
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid action.' }, { status: 400 });
      }
      if (session.candidate_lifecycle_status) {
        return NextResponse.json({ error: 'Clear the lifecycle status before regenerating this invite.' }, { status: 400 });
      }

      const token = generateToken();
      const [updated] = await sql<Session[]>`
        UPDATE sessions
        SET token = ${token},
            invite_email_status = 'not_sent',
            invite_email_sent_at = NULL,
            invite_email_error = NULL
        WHERE id = ${sessionId}
          AND status = 'pending'
          AND started_at IS NULL
          AND candidate_lifecycle_status IS NULL
          AND COALESCE(invite_email_status, 'not_sent') <> 'sending'
        RETURNING *
      `;
      if (!updated) {
        return NextResponse.json({ error: 'Invite link regeneration is only available for pending candidates who have not started.' }, { status: 409 });
      }
      await writeLifecycleEvent(sql, sessionId, action, session.token, token, user.email, reason);
      return NextResponse.json({ session: updated, invite_url: `/session/${updated.token}` });
    }

    if (action === 'revoke') {
      try {
        assertPendingUnstarted(session, 'Revoking invites');
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid action.' }, { status: 400 });
      }
    }

    const nextStatus = nextLifecycleStatus(action);
    const [updated] = await sql<Session[]>`
      UPDATE sessions
      SET candidate_lifecycle_status = ${nextStatus},
          candidate_lifecycle_reason = ${reason},
          candidate_lifecycle_updated_at = NOW(),
          candidate_lifecycle_updated_by_email = ${user.email}
      WHERE id = ${sessionId}
        AND COALESCE(invite_email_status, 'not_sent') <> 'sending'
        ${action === 'revoke' ? sql`AND status = 'pending' AND started_at IS NULL` : sql``}
      RETURNING *
    `;
    if (!updated) {
      return NextResponse.json({ error: 'Lifecycle changes are unavailable while an invite email is sending. Revoking invites is only available for pending candidates who have not started.' }, { status: 409 });
    }
    await writeLifecycleEvent(
      sql,
      sessionId,
      action,
      session.candidate_lifecycle_status,
      nextStatus,
      user.email,
      reason
    );

    return NextResponse.json({ session: updated, invite_url: `/session/${updated.token}` });
  } catch (error) {
    console.error('Error updating session lifecycle:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
