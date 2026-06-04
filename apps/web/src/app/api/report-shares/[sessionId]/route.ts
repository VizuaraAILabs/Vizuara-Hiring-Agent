import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import sql from '@/lib/db';
import { getAuthUser, hasCompanyRole, isAdmin } from '@/lib/auth';
import type { ReportShareLink } from '@/types';

type SessionOwnershipRow = {
  id: string;
  status: string;
  company_id: string;
};

function normalizeDurationDays(value: unknown) {
  const parsed = Number(value ?? 7);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
}

async function getAuthorizedSession(sessionId: string) {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const [session] = await sql<SessionOwnershipRow[]>`
    SELECT s.id, s.status, c.company_id
    FROM sessions s
    JOIN challenges c ON c.id = s.challenge_id
    WHERE s.id = ${sessionId}
  `;

  if (!session) return { error: NextResponse.json({ error: 'Session not found' }, { status: 404 }) };
  if (session.company_id !== user.companyId && !isAdmin(user.email, user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, user };
}

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const auth = await getAuthorizedSession(sessionId);
    if (auth.error) return auth.error;

    const [shareLink] = await sql<ReportShareLink[]>`
      SELECT *
      FROM report_share_links
      WHERE session_id = ${sessionId}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return NextResponse.json({ shareLink: shareLink ?? null });
  } catch (error) {
    console.error('Error fetching report share link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const auth = await getAuthorizedSession(sessionId);
    if (auth.error) return auth.error;
    if (auth.user.companyId && !hasCompanyRole(auth.user, ['owner', 'recruiter'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (auth.session.status !== 'analyzed') {
      return NextResponse.json({ error: 'Only analyzed reports can be shared.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const durationDays = normalizeDurationDays(body.duration_days);
    const token = randomBytes(24).toString('base64url');

    let shareLink: ReportShareLink | undefined;
    await sql.begin(async (tx) => {
      const trx = tx as unknown as typeof sql;

      await trx`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;

      await trx`
        UPDATE report_share_links
        SET revoked_at = NOW()
        WHERE session_id = ${sessionId}
          AND revoked_at IS NULL
      `;

      [shareLink] = await trx<ReportShareLink[]>`
        INSERT INTO report_share_links (
          session_id,
          token,
          expires_at,
          created_by_email,
          created_by_name
        )
        VALUES (
          ${sessionId},
          ${token},
          NOW() + (${durationDays} * interval '1 day'),
          ${auth.user.email},
          ${auth.user.name}
        )
        RETURNING *
      `;
    });

    return NextResponse.json({ shareLink });
  } catch (error) {
    console.error('Error creating report share link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const auth = await getAuthorizedSession(sessionId);
    if (auth.error) return auth.error;
    if (auth.user.companyId && !hasCompanyRole(auth.user, ['owner', 'recruiter'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await sql.begin(async (tx) => {
      const trx = tx as unknown as typeof sql;

      await trx`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;

      await trx`
        UPDATE report_share_links
        SET revoked_at = NOW()
        WHERE session_id = ${sessionId}
          AND revoked_at IS NULL
      `;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error revoking report share link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
