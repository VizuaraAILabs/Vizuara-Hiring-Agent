import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, hasCompanyRole, type CompanyRole } from '@/lib/auth';
import { sendTeamInviteEmail } from '@/lib/brevo';
import sql from '@/lib/db';

type InvitedMemberRow = {
  id: string;
  email: string;
  name: string | null;
  role: CompanyRole;
  company_name: string;
};

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

function formatRole(role: CompanyRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
  if (!hasCompanyRole(user, ['owner'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { memberId } = await params;
  const [target] = await sql<InvitedMemberRow[]>`
    SELECT cm.id, cm.email, cm.name, cm.role, c.name AS company_name
    FROM company_members cm
    JOIN companies c ON c.id = cm.company_id
    WHERE cm.id = ${memberId}
      AND cm.company_id = ${user.companyId}
      AND cm.status = 'invited'
    LIMIT 1
  `;

  if (!target) {
    return NextResponse.json({ error: 'Pending invite not found.' }, { status: 404 });
  }

  const inviteLink = new URL('/register', new URL(request.url).origin);
  inviteLink.searchParams.set('company', target.company_name);

  try {
    await sendTeamInviteEmail({
      to: target.email,
      toName: target.name || target.email,
      companyName: target.company_name,
      role: formatRole(target.role),
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
      WHERE id = ${target.id}
        AND status = 'invited'
      RETURNING id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
    `;

    return NextResponse.json({ member, email_status: 'sent' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send team invite email';
    console.error('Failed to resend team invite email', error);
    const [member] = await sql<TeamMemberRow[]>`
      UPDATE company_members
      SET
        invite_email_status = 'failed',
        invite_email_error = ${message},
        updated_at = NOW()
      WHERE id = ${target.id}
        AND status = 'invited'
      RETURNING id, email, name, role, status, invited_at, invite_email_status, invite_email_sent_at, invite_email_error, joined_at, created_at
    `;

    return NextResponse.json({ member, email_status: 'failed', email_error: message });
  }
}
