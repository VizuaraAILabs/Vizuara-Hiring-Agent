'use client';

import { useEffect, useMemo, useState } from 'react';

type TeamRole = 'owner' | 'recruiter' | 'viewer';
type TeamStatus = 'invited' | 'active';
type InviteEmailStatus = 'not_sent' | 'sent' | 'failed';

type TeamMember = {
  id: string;
  email: string;
  name: string | null;
  role: TeamRole;
  status: TeamStatus;
  invited_at: string;
  invite_email_status: InviteEmailStatus;
  invite_email_sent_at: string | null;
  invite_email_error: string | null;
  joined_at: string | null;
  created_at: string;
};

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Owner',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
};

const INVITE_ROLES: Exclude<TeamRole, 'owner'>[] = ['recruiter', 'viewer'];
const INVITE_EMAIL_LABELS: Record<InviteEmailStatus, string> = {
  not_sent: 'Not sent',
  sent: 'Email sent',
  failed: 'Email failed',
};

function formatDate(value: string | null) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamMemberLimit, setTeamMemberLimit] = useState(1);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, 'owner'>>('recruiter');

  const usedSeats = useMemo(
    () => members.filter((member) => member.status === 'active' || member.status === 'invited').length,
    [members]
  );
  const seatsAvailable = Math.max(0, teamMemberLimit - usedSeats);

  async function loadTeam() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/team/members');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to load team.');
      setMembers(data.members ?? []);
      setTeamMemberLimit(data.teamMemberLimit ?? 1);
      setCanManageTeam(Boolean(data.canManageTeam));
      setCurrentMemberId(data.currentMemberId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
  }, []);

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to invite teammate.');
      setInviteEmail('');
      setInviteName('');
      setInviteRole('recruiter');
      if (data.email_error) {
        setError(`Invite added, but email failed: ${data.email_error}`);
      } else {
        setNotice(data.email_status === 'sent' ? 'Invite added and email sent.' : 'Invite added.');
      }
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite teammate.');
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(memberId: string, role: Exclude<TeamRole, 'owner'>) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update role.');
      setMembers((current) => current.map((member) => (
        member.id === memberId ? data.member || { ...member, role } : member
      )));
      setNotice('Role updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(memberId: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to remove teammate.');
      setMembers((current) => current.filter((member) => member.id !== memberId));
      setNotice('Teammate removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove teammate.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelInvite(memberId: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to cancel invite.');
      setMembers((current) => current.filter((member) => member.id !== memberId));
      setNotice('Invite canceled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invite.');
    } finally {
      setSaving(false);
    }
  }

  async function resendInvite(memberId: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/team/members/${memberId}/resend`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.email_error || 'Failed to resend invite.');
      if (data.member) {
        setMembers((current) => current.map((member) => (
          member.id === memberId ? data.member : member
        )));
      }
      if (data.email_error) {
        setError(`Invite email failed: ${data.email_error}`);
      } else {
        setNotice(data.email_status === 'sent' ? 'Invite email resent.' : 'Invite email status updated.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invite.');
      await loadTeam();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-24 rounded-2xl border border-white/5 bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-serif italic text-white">Team</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage people who can access this company workspace.
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">Seats</p>
            <p className="mt-1 text-xl font-semibold text-white">{usedSeats} / {teamMemberLimit}</p>
          </div>
          <p className="text-sm text-neutral-500">
            {seatsAvailable > 0 ? `${seatsAvailable} available` : 'Limit reached'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {notice}
        </div>
      )}

      {canManageTeam && (
        <form onSubmit={inviteMember} className="rounded-2xl border border-white/5 bg-surface p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Invite teammate</h2>
            <p className="mt-1 text-xs text-neutral-500">They will join this company after logging in with the invited email.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_150px_auto]">
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@company.com"
              required
              className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-primary"
            />
            <input
              type="text"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              placeholder="Name"
              className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-primary"
            />
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as Exclude<TeamRole, 'owner'>)}
              className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary"
            >
              {INVITE_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || seatsAvailable <= 0}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Invite
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs text-neutral-500">
              <th className="px-5 py-3 font-medium">Member</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              {canManageTeam && <th className="px-5 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isCurrent = currentMemberId === member.id;
              const canEditMember = canManageTeam && member.role !== 'owner' && !isCurrent;
              return (
                <tr key={member.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-white">{member.name || member.email}</p>
                    <p className="text-xs text-neutral-500">{member.email}{isCurrent ? ' - You' : ''}</p>
                  </td>
                  <td className="px-5 py-4">
                    {canEditMember ? (
                      <select
                        value={member.role}
                        onChange={(event) => updateRole(member.id, event.target.value as Exclude<TeamRole, 'owner'>)}
                        disabled={saving}
                        className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white outline-none focus:border-primary disabled:opacity-50"
                      >
                        {INVITE_ROLES.map((role) => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-neutral-300">{ROLE_LABELS[member.role]}</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-neutral-400">{member.status === 'active' ? 'Active' : 'Invited'}</p>
                    {member.status === 'invited' && (
                      <p className={member.invite_email_status === 'failed' ? 'text-xs text-red-300' : 'text-xs text-neutral-500'}>
                        {INVITE_EMAIL_LABELS[member.invite_email_status]}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-neutral-500">
                    {member.status === 'active' ? formatDate(member.joined_at) : formatDate(member.invited_at)}
                  </td>
                  {canManageTeam && (
                    <td className="px-5 py-4 text-right">
                      {canEditMember ? (
                        <div className="flex justify-end gap-2">
                          {member.status === 'invited' && (
                            <button
                              type="button"
                              onClick={() => resendInvite(member.id)}
                              disabled={saving}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Resend
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => (member.status === 'invited' ? cancelInvite(member.id) : removeMember(member.id))}
                            disabled={saving}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {member.status === 'invited' ? 'Cancel invite' : 'Remove'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-600">Locked</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
