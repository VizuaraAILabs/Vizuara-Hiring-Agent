'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, LogOut } from 'lucide-react';
import ArcSpinner from '@/components/ArcSpinner';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/utils';

interface AdminSessionEnding {
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

const END_REASON_LABELS: Record<string, string> = {
  candidate_ended: 'Candidate ended',
  timer_expired: 'Timer expired',
  workspace_failed: 'Workspace failed to start',
};

const END_REASON_COLORS: Record<string, string> = {
  candidate_ended: 'border-white/10 bg-white/5 text-neutral-300',
  timer_expired: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  workspace_failed: 'border-red-500/20 bg-red-500/10 text-red-300',
};

function formatWhen(value: string | null) {
  return value ? formatDateTime(value) : 'Unknown';
}

export default function AdminSessionEndingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [endings, setEndings] = useState<AdminSessionEnding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const workspaceFailedCount = useMemo(
    () => endings.filter((e) => e.end_reason === 'workspace_failed').length,
    [endings],
  );

  async function loadEndings(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/admin/session-endings');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.endings)) {
        throw new Error(data?.error || 'Failed to load session endings.');
      }
      setEndings(data.endings);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session endings.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user?.isAdmin) return;
    void loadEndings();
  }, [authLoading, user?.isAdmin]);

  if (authLoading || !user?.isAdmin) return null;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-serif italic text-white">Session Endings</h1>
          <p className="mt-1 text-neutral-500">
            Why candidate sessions ended — candidate action, timer expiry, or a workspace failure. Not visible to recruiters.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEndings()}
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">Total tracked endings</p>
          <p className="mt-1 text-2xl font-semibold text-white">{endings.length}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">Workspace failures</p>
          <p className="mt-1 text-2xl font-semibold text-red-300">{workspaceFailedCount}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">Other endings</p>
          <p className="mt-1 text-2xl font-semibold text-white">{endings.length - workspaceFailedCount}</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Recent Endings</h2>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10">
            <ArcSpinner label="Loading session endings" sizeClassName="h-8 w-8" />
          </div>
        ) : endings.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-white">No tracked endings yet</p>
            <p className="mt-1 text-xs text-neutral-500">Sessions ended before this tracking was added won&apos;t show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Candidate</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company / Challenge</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Reason</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Started</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Ended</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500" />
                </tr>
              </thead>
              <tbody>
                {endings.map((item) => (
                  <tr key={item.session_id} className="border-b border-white/5 last:border-0 hover:bg-white/2">
                    <td className="px-5 py-4">
                      <p className="max-w-48 truncate font-medium text-white">{item.candidate_name}</p>
                      <p className="max-w-48 truncate text-xs text-neutral-500">{item.candidate_email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-64 truncate text-neutral-300">{item.company_name}</p>
                      <p className="max-w-64 truncate text-xs text-neutral-500">{item.challenge_title}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          END_REASON_COLORS[item.end_reason ?? ''] ?? END_REASON_COLORS.candidate_ended
                        }`}
                      >
                        {END_REASON_LABELS[item.end_reason ?? ''] ?? item.end_reason}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-neutral-500">{formatWhen(item.started_at)}</td>
                    <td className="px-5 py-4 text-neutral-500">{formatWhen(item.ended_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end">
                        <Link
                          href={`/dashboard/admin/challenges/${item.challenge_id}`}
                          className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
