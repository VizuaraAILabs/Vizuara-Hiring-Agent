import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, hasCompanyRole, type CompanyRole } from '@/lib/auth';
import { sendTeamInviteEmail } from '@/lib/brevo';
import sql from '@/lib/db';
import { normalizeIdentityEmail } from '@/lib/email';
import { getPlanTeamMemberLimit } from '@/lib/plan-limits';
import type { PlanTier } from '@/types';

const INVITABLE_ROLES: CompanyRole[] = ['recruiter', 'viewer'];

type TeamMemberRow = {
  id: string;
  email: string;
  name: string | null;
  role: CompanyRole;
  status: 'invited' | 'active' | 'removed';
  invited_at: string;
  invite_email_status: 'not_sent' | 'sent' | 'failed';
  invite_email_sent_at: string | null;
  invite_email_error: string | null;
  joined_at: string | null;
  created_at: string;
};

type InviteResult =
  | { member: TeamMemberRow; companyName: string }
  | { error: string; status: number };

function normalizeInviteRole(value: unknown): CompanyRole | null {
  return typeof value === 'string' && INVITABLE_ROLES.includes(value as CompanyRole)
    ? value as CompanyRole
    : null;
}

function formatRole(role: CompanyRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === '23505';
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
  if (!hasCompanyRole(user, ['owner', 'recruiter'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [company] = await sql<{ plan: PlanTier; team_member_limit: number }[]>`
    SELECT plan, team_member_limit FROM companies WHERE id = ${user.companyId}
  `;
  const teamMemberLimit = company
    ? getPlanTeamMemberLimit(company.plan, company.team_member_limit)
    : 1;

  const members = await sql`
    SELECT id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
    FROM company_members
    WHERE company_id = ${user.companyId}
      AND status <> 'removed'
    ORDER BY
      CASE role WHEN 'owner' THEN 0 WHEN 'recruiter' THEN 1 ELSE 2 END,
      COALESCE(joined_at, invited_at, created_at) ASC
  `;

  return NextResponse.json({
    members,
    teamMemberLimit,
    canManageTeam: hasCompanyRole(user, ['owner']),
    currentMemberId: user.memberId,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
  if (!hasCompanyRole(user, ['owner'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = normalizeIdentityEmail(typeof body.email === 'string' ? body.email : '');
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const role = normalizeInviteRole(body.role);

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid teammate email is required.' }, { status: 400 });
  }
  if (email === user.email) {
    return NextResponse.json({ error: 'You are already a member of this company account.' }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: 'Choose recruiter or viewer access.' }, { status: 400 });
  }

  let result: InviteResult;
  try {
    result = await sql.begin(async (tx): Promise<InviteResult> => {
      const trx = tx as unknown as typeof sql;
      const [company] = await trx<{ name: string; plan: PlanTier; team_member_limit: number }[]>`
        SELECT name, plan, team_member_limit FROM companies WHERE id = ${user.companyId}
        FOR UPDATE
      `;
      if (!company) return { error: 'Company not found', status: 404 };
      const teamMemberLimit = getPlanTeamMemberLimit(company.plan, company.team_member_limit);

      const [existingMember] = await trx<{ id: string; company_id: string; status: string }[]>`
        SELECT id, company_id, status
        FROM company_members
        WHERE LOWER(email) = ${email}
        LIMIT 1
      `;
      if (existingMember && existingMember.company_id !== user.companyId) {
        return { error: 'This email is already associated with another company account.', status: 409 };
      }
      if (existingMember && existingMember.status !== 'removed') {
        return { error: 'That teammate is already invited or active.', status: 409 };
      }

      const [{ count }] = await trx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM company_members
        WHERE company_id = ${user.companyId}
          AND status IN ('active', 'invited')
      `;
      if (count >= teamMemberLimit) {
        return { error: 'Team member limit reached.', status: 400 };
      }

      const [member] = await trx<TeamMemberRow[]>`
        INSERT INTO company_members (company_id, email, name, role, status, invited_by)
        VALUES (${user.companyId}, ${email}, ${name}, ${role}, 'invited', ${user.memberId})
        ON CONFLICT (company_id, email) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          status = 'invited',
          firebase_uid = NULL,
          invited_by = EXCLUDED.invited_by,
          invited_at = NOW(),
          invite_email_status = 'not_sent',
          invite_email_sent_at = NULL,
          invite_email_error = NULL,
          joined_at = NULL,
          updated_at = NOW()
        WHERE company_members.status = 'removed'
        RETURNING id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
      `;

      if (!member) {
        return { error: 'That teammate is already invited or active.', status: 409 };
      }

      return { member, companyName: company.name };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'This email is already associated with another company account.' }, { status: 409 });
    }
    throw error;
  }

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const inviteLink = new URL('/register', new URL(request.url).origin);
  inviteLink.searchParams.set('company', result.companyName);

  try {
    await sendTeamInviteEmail({
      to: email,
      toName: name || email,
      companyName: result.companyName,
      role: formatRole(role),
      invitedByName: user.name || user.email,
      invitedByEmail: user.email,
      inviteLink: inviteLink.toString(),
    });

    const [member] = await sql<TeamMemberRow[]>`
      UPDATE company_members
      SET
        invite_email_status = 'sent',
        invite_email_sent_at = NOW(),
        invite_email_error = NULL,
        updated_at = NOW()
      WHERE id = ${result.member.id}
        AND status = 'invited'
      RETURNING id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
    `;

    return NextResponse.json({ member: member || result.member, email_status: 'sent' }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send team invite email';
    console.error('Failed to send team invite email', error);
    const [member] = await sql<TeamMemberRow[]>`
      UPDATE company_members
      SET
        invite_email_status = 'failed',
        invite_email_error = ${message},
        updated_at = NOW()
      WHERE id = ${result.member.id}
        AND status = 'invited'
      RETURNING id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
    `;

    return NextResponse.json({
      member: member || result.member,
      email_status: 'failed',
      email_error: message,
    }, { status: 201 });
  }
}
