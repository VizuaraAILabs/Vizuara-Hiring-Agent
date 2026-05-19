import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { sendInviteEmail } from '@/lib/brevo';
import { generateToken } from '@/lib/utils';
import { addEmailToAllowlist, normalizeEmail, validateChallengeAccess } from '@/lib/challenge-access';
import { getChallengeById } from '@/lib/challenge-queries';
import {
  DEFAULT_INVITE_EMAIL_BODY,
  DEFAULT_INVITE_EMAIL_SUBJECT,
  renderInviteEmailTemplate,
} from '@/lib/invite-email';
import { v4 as uuidv4 } from 'uuid';

type InviteCreationResult = {
  body: Record<string, unknown>;
  status?: number;
  sessionId?: string;
  token?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userIsAdmin = isAdmin(user.email, user.role);
    if (!user.companyId && !userIsAdmin) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { id } = await params;

    const challenge = await getChallengeById(id);

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.companyId && !userIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      candidate_name,
      candidate_email,
      send_email = false,
      email_subject,
      email_body,
    } = await request.json();
    const shouldSendEmail = send_email === true;

    if (!candidate_name || !candidate_email) {
      return NextResponse.json({ error: 'Candidate name and email are required' }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(String(candidate_email));
    const candidateName = String(candidate_name).trim();
    if (!candidateName || !normalizedEmail) {
      return NextResponse.json({ error: 'Candidate name and email are required' }, { status: 400 });
    }
    if (shouldSendEmail && typeof email_subject === 'string' && email_subject.trim().length > 160) {
      return NextResponse.json({ error: 'Invite email subject must be 160 characters or fewer.' }, { status: 400 });
    }
    if (shouldSendEmail && typeof email_body === 'string' && email_body.trim().length > 5000) {
      return NextResponse.json({ error: 'Invite email body must be 5000 characters or fewer.' }, { status: 400 });
    }

    const timingAccess = await validateChallengeAccess(challenge, { allowBeforeStart: true });
    if (!timingAccess.ok) {
      return NextResponse.json(
        { error: timingAccess.message, reason: timingAccess.reason },
        { status: timingAccess.status }
      );
    }

    const [company] = await sql<{ name: string }[]>`
      SELECT name FROM companies WHERE id = ${challenge.company_id}
    `;
    const companyName = company?.name || 'ArcEval';

    const result = await sql.begin(async (tx): Promise<InviteCreationResult> => {
      const trx = tx as unknown as typeof sql;

      await trx`SELECT pg_advisory_xact_lock(hashtext(${challenge.company_id}))`;
      await trx`SELECT pg_advisory_xact_lock(hashtext(${challenge.id}))`;

      const lockedChallenge = await getChallengeById(id);
      if (!lockedChallenge) {
        return { body: { error: 'Challenge not found' }, status: 404 };
      }

      const lockedTimingAccess = await validateChallengeAccess(lockedChallenge, { allowBeforeStart: true });
      if (!lockedTimingAccess.ok) {
        return {
          body: { error: lockedTimingAccess.message, reason: lockedTimingAccess.reason },
          status: lockedTimingAccess.status,
        };
      }

      const [existing] = await trx`
        SELECT id, token, status, candidate_lifecycle_status FROM sessions
        WHERE challenge_id = ${id} AND LOWER(TRIM(candidate_email)) = ${normalizedEmail}
        ORDER BY created_at DESC LIMIT 1
      `;

      if (existing) {
        if (existing.status === 'pending' || existing.status === 'active') {
          if (existing.candidate_lifecycle_status) {
            return {
              body: { error: 'This candidate has a lifecycle status set. Clear it from the Candidates tab before reusing this invite.' },
              status: 409,
            };
          }
          const allowedEmails = addEmailToAllowlist(lockedChallenge.allowed_emails, normalizedEmail);
          await trx`UPDATE challenges SET allowed_emails = ${allowedEmails} WHERE id = ${id}`;
          return {
            body: { token: existing.token, invite_url: `/session/${existing.token}` },
            sessionId: existing.id,
            token: existing.token,
          };
        }
        return {
          body: { error: 'This candidate already has a submitted assessment for this challenge.' },
          status: 403,
        };
      }

      const access = await validateChallengeAccess(lockedChallenge, {
        allowBeforeStart: true,
        enforceCapacity: true,
        enforcePlanQuota: true,
        db: trx,
      });
      if (!access.ok) {
        return {
          body: { error: access.message, reason: access.reason },
          status: access.status,
        };
      }

      const sessionId = uuidv4();
      const token = generateToken();
      const allowedEmails = addEmailToAllowlist(lockedChallenge.allowed_emails, normalizedEmail);

      await trx`
        INSERT INTO sessions (id, challenge_id, candidate_name, candidate_email, token)
        VALUES (${sessionId}, ${id}, ${candidateName}, ${normalizedEmail}, ${token})
      `;
      await trx`UPDATE challenges SET allowed_emails = ${allowedEmails} WHERE id = ${id}`;

      return { body: { token, invite_url: `/session/${token}` }, status: 201, sessionId, token };
    });

    if (shouldSendEmail && result.sessionId && result.token && !result.body.error) {
      const origin = new URL(request.url).origin;
      const assessmentLink = `${origin}/session/${result.token}`;
      const subjectTemplate = typeof email_subject === 'string' && email_subject.trim()
        ? email_subject.trim()
        : challenge.invite_email_subject || DEFAULT_INVITE_EMAIL_SUBJECT;
      const bodyTemplate = typeof email_body === 'string' && email_body.trim()
        ? email_body.trim()
        : challenge.invite_email_body || DEFAULT_INVITE_EMAIL_BODY;
      const mergeData = {
        candidateName,
        challengeTitle: challenge.title,
        assessmentLink,
        timeLimitMin: challenge.time_limit_min,
        startsAt: challenge.starts_at,
        endsAt: challenge.ends_at,
        companyName,
      };
      const subject = renderInviteEmailTemplate(subjectTemplate, mergeData);
      const bodyText = renderInviteEmailTemplate(bodyTemplate, mergeData);

      try {
        await sendInviteEmail({
          to: normalizedEmail,
          toName: candidateName,
          subject,
          bodyText,
          companyName,
          assessmentLink,
        });
        await sql`
          UPDATE sessions
          SET invite_email_status = 'sent',
              invite_email_sent_at = NOW(),
              invite_email_error = NULL
          WHERE id = ${result.sessionId}
        `;
        result.body.email_status = 'sent';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send invite email';
        console.error('Failed to send invite email:', {
          challengeId: id,
          sessionId: result.sessionId,
          candidateEmail: normalizedEmail,
          error: message,
        });
        await sql`
          UPDATE sessions
          SET invite_email_status = 'failed',
              invite_email_error = ${message}
          WHERE id = ${result.sessionId}
        `;
        result.body.email_status = 'failed';
        result.body.email_error = 'Email could not be sent. The invite link is ready to copy.';
      }
    } else if (result.sessionId && !result.body.error) {
      await sql`
        UPDATE sessions
        SET invite_email_status = COALESCE(invite_email_status, 'not_sent')
        WHERE id = ${result.sessionId}
      `;
      result.body.email_status = 'not_sent';
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
