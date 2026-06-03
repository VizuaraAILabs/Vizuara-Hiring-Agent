import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, hasCompanyRole, type CompanyRole } from '@/lib/auth';
import sql from '@/lib/db';

const EDITABLE_ROLES: CompanyRole[] = ['recruiter', 'viewer'];

function normalizeEditableRole(value: unknown): CompanyRole | null {
  return typeof value === 'string' && EDITABLE_ROLES.includes(value as CompanyRole)
    ? value as CompanyRole
    : null;
}

async function getEditableTarget(companyId: string, memberId: string) {
  const [member] = await sql<{ id: string; role: CompanyRole; status: string }[]>`
    SELECT id, role, status
    FROM company_members
    WHERE id = ${memberId}
      AND company_id = ${companyId}
      AND status <> 'removed'
    LIMIT 1
  `;
  return member ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
  if (!hasCompanyRole(user, ['owner'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { memberId } = await params;
  const target = await getEditableTarget(user.companyId, memberId);
  if (!target) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Owner role cannot be changed in this version.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const role = normalizeEditableRole(body.role);
  if (!role) return NextResponse.json({ error: 'Choose recruiter or viewer access.' }, { status: 400 });

  const [member] = await sql`
    UPDATE company_members
    SET
      role = ${role},
      invite_email_status = CASE WHEN status = 'invited' THEN 'not_sent' ELSE invite_email_status END,
      invite_email_sent_at = CASE WHEN status = 'invited' THEN NULL ELSE invite_email_sent_at END,
      invite_email_error = CASE WHEN status = 'invited' THEN NULL ELSE invite_email_error END,
      updated_at = NOW()
    WHERE id = ${memberId}
      AND company_id = ${user.companyId}
    RETURNING id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
  `;

  return NextResponse.json({ member });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
  if (!hasCompanyRole(user, ['owner'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { memberId } = await params;
  if (user.memberId && user.memberId === memberId) {
    return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 });
  }

  const target = await getEditableTarget(user.companyId, memberId);
  if (!target) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Owner cannot be removed in this version.' }, { status: 400 });
  }

  await sql`
    UPDATE company_members
    SET
      status = 'removed',
      firebase_uid = NULL,
      invite_email_status = CASE WHEN status = 'invited' THEN 'not_sent' ELSE invite_email_status END,
      invite_email_sent_at = CASE WHEN status = 'invited' THEN NULL ELSE invite_email_sent_at END,
      invite_email_error = CASE WHEN status = 'invited' THEN NULL ELSE invite_email_error END,
      updated_at = NOW()
    WHERE id = ${memberId}
      AND company_id = ${user.companyId}
  `;

  return NextResponse.json({ ok: true });
}
