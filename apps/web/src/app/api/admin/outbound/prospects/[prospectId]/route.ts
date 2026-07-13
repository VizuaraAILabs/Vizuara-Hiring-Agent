import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

const REVIEW_STATUSES = new Set(['approved', 'rejected', 'disqualified']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email, user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { prospectId } = await params;
  const body = await req.json().catch(() => ({}));
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!REVIEW_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Unsupported review status' }, { status: 400 });
  }

  const [prospect] = await sql`
    UPDATE outbound_prospects
    SET status = ${status},
        reviewed_by_email = ${user.email},
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${prospectId}
    RETURNING id, status, reviewed_by_email, reviewed_at
  `;

  if (!prospect) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  }

  return NextResponse.json({ prospect });
}
