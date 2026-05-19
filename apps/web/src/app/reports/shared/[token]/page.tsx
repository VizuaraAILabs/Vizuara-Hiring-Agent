'use client';

import KeyMoments from '@/components/report/KeyMoments';
import PrintableReport from '@/components/report/PrintableReport';
import ReportHeader from '@/components/report/ReportHeader';
import ReportSummary from '@/components/report/ReportSummary';
import ScoreSummary from '@/components/report/ScoreSummary';
import type { AnalysisResult, Session } from '@/types';
import { FileDown } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type SharedReportResponse = {
  session: Session;
  challenge: {
    id: string;
    title: string;
    description: string;
    time_limit_min: number;
    role: string | null;
    tech_stack: string | null;
    seniority: string | null;
    focus_areas: string | null;
    context: string | null;
    cohort_label: string | null;
    created_at: string;
  };
  analysis: AnalysisResult;
  expires_at: string;
};

export default function SharedReportPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<SharedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      try {
        const res = await fetch(`/api/public/report-shares/${token}`);
        const response = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(response?.error || 'Report link is unavailable.');
        }
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Report link is unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl animate-pulse space-y-4">
          <div className="h-20 rounded-xl bg-surface" />
          <div className="h-72 rounded-2xl bg-surface" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 sm:px-6">
        <div className="max-w-md rounded-2xl border border-white/5 bg-surface p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Report unavailable</h1>
          <p className="mt-2 text-sm text-neutral-500">{error ?? 'This link may have expired or been revoked.'}</p>
        </div>
      </main>
    );
  }

  const scores = {
    problem_decomposition: data.analysis.problem_decomposition,
    first_principles: data.analysis.first_principles,
    creativity: data.analysis.creativity,
    iteration_quality: data.analysis.iteration_quality,
    debugging_approach: data.analysis.debugging_approach,
    architecture_thinking: data.analysis.architecture_thinking,
    communication_clarity: data.analysis.communication_clarity,
    efficiency: data.analysis.efficiency,
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6">
      <div className="print-only">
        <PrintableReport session={data.session} analysis={data.analysis} challenge={data.challenge} />
      </div>

      <div className="screen-only mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-white/5 bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Read-only candidate report</p>
            <p className="mt-1 text-xs text-neutral-500">Expires {new Date(data.expires_at).toLocaleString()}</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </button>
        </div>

        <ReportHeader session={data.session} analysis={data.analysis} />

        <div className="mt-6 space-y-6">
          <ReportSummary analysis={data.analysis} />
          <ScoreSummary
            dimensions={data.analysis.dimension_details}
            scores={scores}
            challengeTitle={data.challenge.title}
            challengeRole={data.challenge.role}
            challengeTechStack={data.challenge.tech_stack}
            challengeSeniority={data.challenge.seniority}
            challengeFocusAreas={data.challenge.focus_areas}
            challengeContext={data.challenge.context}
          />
          <KeyMoments moments={data.analysis.key_moments} />
        </div>
      </div>
    </main>
  );
}
