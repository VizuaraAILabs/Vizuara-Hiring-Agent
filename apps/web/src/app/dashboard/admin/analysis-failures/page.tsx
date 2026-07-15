'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock3, RefreshCw, RotateCcw } from 'lucide-react';
import ArcSpinner from '@/components/ArcSpinner';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/utils';

interface AdminAnalysisFailure {
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  session_status: string;
  session_ended_at: string | null;
  error_code: string | null;
  error_message: string | null;
  error_metadata: Record<string, unknown> | null;
  failed_at: string | null;
  failure_count: number;
  analysis_job_status: string | null;
  analysis_job_attempt_count: number | null;
  analysis_job_last_error: string | null;
  analysis_job_updated_at: string | null;
  interaction_count: number;
}

interface AdminAnalysisInProgress {
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  session_status: string;
  session_ended_at: string | null;
  analysis_job_status: string | null;
  analysis_job_attempt_count: number | null;
  analysis_job_claimed_by: string | null;
  analysis_job_claimed_at: string | null;
  analysis_job_updated_at: string | null;
  analysis_started_at: string | null;
  minutes_in_analysis: number;
  interaction_count: number;
}

function formatWhen(value: string | null) {
  return value ? formatDateTime(value) : 'Unknown';
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatTimeout(metadata: Record<string, unknown> | null) {
  const timeoutMs = metadata?.timeout_ms;
  if (typeof timeoutMs !== 'number') return null;
  const minutes = timeoutMs / 60000;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

function StatusBadge({ status }: { status: string }) {
  const isAnalyzing = status === 'analyzing';
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        isAnalyzing
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      }`}
    >
      {isAnalyzing ? 'Analyzing' : 'Queued'}
    </span>
  );
}

function ErrorBadge({ code }: { code: string | null }) {
  const isTimeout = code?.includes('timeout');
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        isTimeout
          ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
          : 'border-red-500/20 bg-red-500/10 text-red-300'
      }`}
    >
      {code ?? 'analysis_failed'}
    </span>
  );
}

export default function AdminAnalysisFailuresPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [failures, setFailures] = useState<AdminAnalysisFailure[]>([]);
  const [inProgress, setInProgress] = useState<AdminAnalysisInProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const timeoutCount = useMemo(
    () => failures.filter((failure) => failure.error_code?.includes('timeout')).length,
    [failures],
  );
  const longestActiveMinutes = useMemo(
    () => inProgress.reduce((max, item) => Math.max(max, Number(item.minutes_in_analysis ?? 0)), 0),
    [inProgress],
  );

  async function loadAnalysisOps(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/admin/analysis-failures');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.failures) || !Array.isArray(data?.inProgress)) {
        throw new Error(data?.error || 'Failed to load analysis operations.');
      }
      setFailures(data.failures);
      setInProgress(data.inProgress);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis operations.');
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
    void loadAnalysisOps();

    const interval = window.setInterval(() => {
      void loadAnalysisOps(false);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [authLoading, user?.isAdmin]);

  async function retryAnalysis(sessionId: string) {
    setRetryingIds((current) => new Set(current).add(sessionId));
    try {
      const res = await fetch(`/api/admin/analysis-failures/${sessionId}/retry`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to retry analysis.');
      }
      setFailures((current) => current.filter((failure) => failure.session_id !== sessionId));
      void loadAnalysisOps(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry analysis.');
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  }

  if (authLoading || !user?.isAdmin) return null;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-serif italic text-white">Analysis Operations</h1>
          <p className="mt-1 text-neutral-500">
            Monitor active analysis jobs, review failures, and retry them after operational fixes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAnalysisOps()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">In progress</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-300">{inProgress.length}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">Failed analyses</p>
          <p className="mt-1 text-2xl font-semibold text-white">{failures.length}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">Timeout failures</p>
          <p className="mt-1 text-2xl font-semibold text-amber-300">{timeoutCount}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <p className="text-xs text-neutral-500">Longest active</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatDuration(longestActiveMinutes)}</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-6 overflow-hidden rounded-2xl border border-white/5 bg-surface">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">In Progress</h2>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10">
            <ArcSpinner label="Loading active analyses" sizeClassName="h-8 w-8" />
          </div>
        ) : inProgress.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-white">No active analyses</p>
            <p className="mt-1 text-xs text-neutral-500">No analysis jobs are currently queued or running.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Candidate</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company / Challenge</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Status</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Time</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Attempts</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Interactions</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Started</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500" />
                </tr>
              </thead>
              <tbody>
                {inProgress.map((item) => (
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
                      <div className="flex flex-col items-start gap-2">
                        <StatusBadge status={item.session_status} />
                        {item.analysis_job_status && (
                          <p className="text-xs text-neutral-500">Job: {item.analysis_job_status}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-white">
                      {formatDuration(Number(item.minutes_in_analysis ?? 0))}
                    </td>
                    <td className="px-5 py-4 text-right text-neutral-300">
                      {item.analysis_job_attempt_count ?? 0}
                    </td>
                    <td className="px-5 py-4 text-right text-neutral-300">
                      {item.interaction_count}
                    </td>
                    <td className="px-5 py-4 text-neutral-500">
                      {formatWhen(item.analysis_started_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end">
                        <Link
                          href={`/dashboard/admin/challenges/${item.challenge_id}`}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white"
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

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Retry Queue</h2>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10">
            <ArcSpinner label="Loading failed analyses" sizeClassName="h-8 w-8" />
          </div>
        ) : failures.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-white">No failed analyses</p>
            <p className="mt-1 text-xs text-neutral-500">Everything that failed has either been retried or resolved.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Candidate</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company / Challenge</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Failure</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Attempts</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Interactions</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500">Failed</th>
                  <th className="px-5 py-3 text-xs font-medium text-neutral-500" />
                </tr>
              </thead>
              <tbody>
                {failures.map((failure) => {
                  const isRetrying = retryingIds.has(failure.session_id);
                  const timeout = formatTimeout(failure.error_metadata);

                  return (
                    <tr key={failure.session_id} className="border-b border-white/5 last:border-0 hover:bg-white/2">
                      <td className="px-5 py-4">
                        <p className="max-w-48 truncate font-medium text-white">{failure.candidate_name}</p>
                        <p className="max-w-48 truncate text-xs text-neutral-500">{failure.candidate_email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="max-w-64 truncate text-neutral-300">{failure.company_name}</p>
                        <p className="max-w-64 truncate text-xs text-neutral-500">{failure.challenge_title}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <ErrorBadge code={failure.error_code} />
                          <p className="max-w-72 line-clamp-2 text-xs text-neutral-500">
                            {failure.error_message ?? failure.analysis_job_last_error ?? 'Analysis failed'}
                          </p>
                          {timeout && (
                            <p className="text-xs text-amber-300/80">Timeout: {timeout}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right text-neutral-300">
                        {failure.analysis_job_attempt_count ?? failure.failure_count}
                      </td>
                      <td className="px-5 py-4 text-right text-neutral-300">
                        {failure.interaction_count}
                      </td>
                      <td className="px-5 py-4 text-neutral-500">
                        {formatWhen(failure.failed_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/admin/challenges/${failure.challenge_id}`}
                            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={() => retryAnalysis(failure.session_id)}
                            disabled={isRetrying}
                            className="inline-flex min-w-20 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isRetrying ? (
                              <ArcSpinner label="Retrying analysis" sizeClassName="h-3.5 w-3.5" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Retry
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
