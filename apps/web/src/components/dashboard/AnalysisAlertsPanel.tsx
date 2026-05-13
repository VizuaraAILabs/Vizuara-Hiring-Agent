'use client';

import Link from 'next/link';
import { AlertTriangle, Clock3, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import ArcSpinner from '@/components/ArcSpinner';

type AnalysisAlertType =
  | 'analysis_not_started'
  | 'queued_too_long'
  | 'analyzing_too_long'
  | 'analysis_failed';

interface AnalysisAlert {
  id: string;
  alert_type: AnalysisAlertType;
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  candidate_name: string;
  candidate_email: string;
  session_status: string;
  event_at: string;
  minutes_waiting: number;
  retryable: boolean;
  last_error: string | null;
  analysis_job_status: string | null;
  analysis_job_attempt_count: number | null;
}

const alertCopy: Record<AnalysisAlertType, { label: string; tone: string }> = {
  analysis_failed: {
    label: 'Analysis failed',
    tone: 'border-red-500/20 bg-red-500/10 text-red-300',
  },
  analyzing_too_long: {
    label: 'Analyzing too long',
    tone: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
  },
  queued_too_long: {
    label: 'Queued too long',
    tone: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  },
  analysis_not_started: {
    label: 'Analysis not started',
    tone: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  },
};

function formatWait(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function AnalysisAlertsPanel() {
  const [alerts, setAlerts] = useState<AnalysisAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  async function loadAlerts(cancelled?: () => boolean) {
    try {
      const res = await fetch('/api/analysis/alerts');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.alerts)) {
        throw new Error(data?.error || 'Failed to load analysis alerts.');
      }
      if (!cancelled?.()) {
        setAlerts(data.alerts);
        setError('');
      }
    } catch (err) {
      if (!cancelled?.()) {
        setError(err instanceof Error ? err.message : 'Failed to load analysis alerts.');
      }
    } finally {
      if (!cancelled?.()) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadAlerts(() => cancelled);

    const interval = window.setInterval(() => {
      void loadAlerts(() => cancelled);
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function retryAnalysis(alert: AnalysisAlert) {
    if (!alert.retryable) return;

    setRetryingIds((current) => new Set(current).add(alert.session_id));
    try {
      const res = await fetch(`/api/analysis/${alert.session_id}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to retry analysis.');
      }
      setAlerts((current) => current.filter((item) => item.session_id !== alert.session_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry analysis.');
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(alert.session_id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-white/5 bg-surface p-4">
        <div className="h-5 w-44 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!error && alerts.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-white/5 bg-surface">
      <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Analysis Attention</h2>
            {alerts.length > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                {alerts.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            Sessions that may need a retry or operational review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadAlerts();
          }}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="divide-y divide-white/5">
          {alerts.map((alert) => {
            const copy = alertCopy[alert.alert_type];
            const isRetrying = retryingIds.has(alert.session_id);

            return (
              <div key={alert.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${copy.tone}`}>
                      {copy.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatWait(alert.minutes_waiting)} since {formatDateTime(alert.event_at)}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-white">{alert.candidate_name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {alert.candidate_email} - {alert.challenge_title}
                  </p>
                  {alert.last_error && (
                    <p className="mt-2 line-clamp-2 text-xs text-red-200/80">{alert.last_error}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {alert.retryable ? (
                    <button
                      type="button"
                      onClick={() => retryAnalysis(alert)}
                      disabled={isRetrying}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRetrying ? (
                        <ArcSpinner label="Retrying analysis" sizeClassName="h-3.5 w-3.5" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Retry
                    </button>
                  ) : (
                    <span className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-neutral-500">
                      Monitor
                    </span>
                  )}
                  <Link
                    href={`/dashboard/challenges/${alert.challenge_id}`}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white"
                  >
                    View Challenge
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
