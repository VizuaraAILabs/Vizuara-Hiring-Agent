import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

const DRAFT_STATUSES = new Set(['draft', 'edited', 'approved', 'rejected']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email, user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { draftId } = await params;
  const body = await req.json().catch(() => ({}));
  const requestedStatus = typeof body?.status === 'string' ? body.status : null;
  if (requestedStatus && !DRAFT_STATUSES.has(requestedStatus)) {
    return NextResponse.json({ error: 'Unsupported draft status' }, { status: 400 });
  }

  const [current] = await sql<{
    id: string;
    status: string;
    subject: string | null;
    body: string;
  }[]>`
    SELECT id, status, subject, body
    FROM outbound_drafts
    WHERE id = ${draftId}
    LIMIT 1
  `;
  if (!current) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  const subject = typeof body?.subject === 'string' ? body.subject.trim() || null : current.subject;
  const draftBody = typeof body?.body === 'string' ? body.body.trim() : current.body;
  if (!draftBody) return NextResponse.json({ error: 'Draft body is required' }, { status: 400 });

  const nextStatus = requestedStatus ?? (draftBody !== current.body || subject !== current.subject ? 'edited' : current.status);
  const approvedBy = nextStatus === 'approved' ? user.email : null;

  const [draft] = await sql`
    UPDATE outbound_drafts
    SET
      subject = ${subject},
      body = ${draftBody},
      status = ${nextStatus},
      approved_by_email = ${approvedBy},
      approved_at = CASE WHEN ${nextStatus} = 'approved' THEN NOW() ELSE NULL END,
      updated_at = NOW()
    WHERE id = ${draftId}
    RETURNING id, prospect_id, contact_id, channel, sequence_step, subject, body,
              personalization_basis, status, approved_by_email, approved_at, created_at, updated_at
  `;

  return NextResponse.json({ draft });
}
