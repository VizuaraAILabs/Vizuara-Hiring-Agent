'use client';

import { getScoreColor, getRecommendationLabel, getRecommendationColor } from '@/lib/utils';
import type { AnalysisResult, Session } from '@/types';

interface ReportHeaderProps {
  session: Session;
  analysis: AnalysisResult;
}

export default function ReportHeader({ session, analysis }: ReportHeaderProps) {
  return (
    <section className="border-b border-white/10 py-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-serif italic text-white mb-1">{session.candidate_name}</h1>
          <p className="text-neutral-500 text-sm">{session.candidate_email}</p>
          <p className="text-neutral-600 text-xs mt-1">
            Session completed {session.ended_at ? new Date(session.ended_at).toLocaleDateString() : 'N/A'}
          </p>
        </div>

        <div className="flex items-center gap-5 sm:justify-end">
          <div className="text-center">
            <div className={`text-4xl font-bold ${getScoreColor(analysis.overall_score)}`}>
              {analysis.overall_score.toFixed(0)}
            </div>
            <p className="text-xs text-neutral-600 mt-1">Overall Score</p>
          </div>

          <span
            className={`px-4 py-2 rounded-xl text-sm font-bold ${getRecommendationColor(
              analysis.hiring_recommendation
            )}`}
          >
            {getRecommendationLabel(analysis.hiring_recommendation)}
          </span>
        </div>
      </div>
    </section>
  );
}
