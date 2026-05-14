'use client';

import type { IntegrityReviewLevel, IntegritySignal, IntegritySignalTone, IntegritySummary } from '@/types';
import { Activity, AlertTriangle, CheckCircle2, Clock, FileCode2, GitCompare, ShieldCheck, type LucideIcon } from 'lucide-react';

interface IntegrityPanelProps {
  summary: IntegritySummary | null;
  loading: boolean;
  error: string | null;
}

const levelCopy: Record<IntegrityReviewLevel, { label: string; className: string; icon: LucideIcon }> = {
  low: {
    label: 'Ordinary ownership signals',
    className: 'border-primary/20 bg-primary/8 text-primary',
    icon: ShieldCheck,
  },
  review: {
    label: 'Review suggested',
    className: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    icon: AlertTriangle,
  },
  limited_evidence: {
    label: 'Limited ownership evidence',
    className: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
    icon: Activity,
  },
  insufficient_data: {
    label: 'Insufficient data',
    className: 'border-neutral-500/25 bg-white/5 text-neutral-300',
    icon: AlertTriangle,
  },
};

const signalToneClass: Record<IntegritySignalTone, string> = {
  positive: 'border-primary/20 bg-primary/5',
  neutral: 'border-white/8 bg-white/[0.03]',
  review: 'border-amber-400/20 bg-amber-400/8',
  warning: 'border-red-400/20 bg-red-400/8',
};

const signalIcon: Record<IntegritySignalTone, LucideIcon> = {
  positive: CheckCircle2,
  neutral: Activity,
  review: AlertTriangle,
  warning: AlertTriangle,
};

function formatSimilarity(value: number | null) {
  return value == null ? 'N/A' : `${Math.round(value * 100)}%`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-neutral-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-neutral-600">{label}</p>
    </div>
  );
}

function SignalCard({ signal }: { signal: IntegritySignal }) {
  const Icon = signalIcon[signal.tone];

  return (
    <div className={`rounded-xl border p-4 ${signalToneClass[signal.tone]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/25 text-neutral-300">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white">{signal.title}</h4>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{signal.description}</p>
          {signal.evidence.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {signal.evidence.map((item, index) => (
                <p key={index} className="rounded-lg bg-black/20 px-3 py-2 text-xs leading-5 text-neutral-500">
                  {item}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IntegrityPanel({ summary, loading, error }: IntegrityPanelProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-surface p-8">
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-48 rounded bg-white/8" />
          <div className="h-20 rounded-xl bg-white/5" />
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="h-24 rounded-xl bg-white/5" />
            <div className="h-24 rounded-xl bg-white/5" />
            <div className="h-24 rounded-xl bg-white/5" />
            <div className="h-24 rounded-xl bg-white/5" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="rounded-2xl border border-white/5 bg-surface p-8">
        <h3 className="text-lg font-semibold text-white">Solution Ownership</h3>
        <p className="mt-3 text-sm text-neutral-500">
          {error ?? 'Ownership signals are not available for this session.'}
        </p>
      </div>
    );
  }

  const level = levelCopy[summary.review_level];
  const LevelIcon = level.icon;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/5 bg-surface p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${level.className}`}>
                <LevelIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {level.label}
              </span>
              <span className="text-xs text-neutral-600">Context signal, not a misconduct finding</span>
            </div>
            <h3 className="mt-5 text-xl font-semibold text-white">Solution Ownership</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{summary.summary}</p>
          </div>

          <div className="shrink-0 rounded-2xl border border-white/5 bg-black/25 px-5 py-4 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Ownership</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.ownership_score}</p>
            <p className="mt-1 text-xs text-neutral-600">out of 100</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={Activity} label="Interactions captured" value={summary.metrics.interaction_count} />
          <MetricCard icon={CheckCircle2} label="Validation commands" value={summary.metrics.test_run_count} />
          <MetricCard icon={FileCode2} label="Large file edits" value={summary.metrics.large_file_edit_count} />
          <MetricCard icon={Clock} label="Longest idle gap" value={`${summary.metrics.max_idle_gap_minutes} min`} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MetricCard
            icon={GitCompare}
            label={`Compared with ${summary.workspace_similarity.compared_sessions} cohort submission${summary.workspace_similarity.compared_sessions === 1 ? '' : 's'}`}
            value={formatSimilarity(summary.workspace_similarity.highest_similarity)}
          />
          <MetricCard
            icon={FileCode2}
            label="Late large changes"
            value={summary.metrics.large_late_change_count}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-surface p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">Evidence Signals</h3>
          <p className="mt-1 text-xs text-neutral-600">
            AI and web research are permitted. These signals focus on verification, continuity, and ownership of the final work.
          </p>
        </div>

        <div className="space-y-3">
          {summary.signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      </section>
    </div>
  );
}
