'use client';

import { getScoreColor, getRecommendationLabel, getRecommendationColor } from '@/lib/utils';
import type { AnalysisResult, Session } from '@/types';

interface ReportHeaderProps {
  session: Session;
  analysis: AnalysisResult;
}

export default function ReportHeader({ session, analysis }: ReportHeaderProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">{session.candidate_name}</h1>
          <p className="text-slate-400 text-sm">{session.candidate_email}</p>
          <p className="text-slate-500 text-xs mt-1">
            Session completed {session.ended_at ? new Date(session.ended_at).toLocaleDateString() : 'N/A'}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-4xl font-bold ${getScoreColor(analysis.overall_score)}`}>
              {analysis.overall_score.toFixed(0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Overall Score</p>
          </div>

          <span
            className={`px-4 py-2 rounded-lg text-sm font-bold ${getRecommendationColor(
              analysis.hiring_recommendation
            )}`}
          >
            {getRecommendationLabel(analysis.hiring_recommendation)}
          </span>
        </div>
      </div>

      {analysis.summary_narrative && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="text-slate-300 text-sm leading-relaxed">{analysis.summary_narrative}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-6">
        {analysis.strengths.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-emerald-400 mb-2">Strengths</h4>
            <ul className="space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-400 flex gap-2">
                  <span className="text-emerald-500 mt-0.5">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.areas_for_growth.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-amber-400 mb-2">Areas for Growth</h4>
            <ul className="space-y-1">
              {analysis.areas_for_growth.map((a, i) => (
                <li key={i} className="text-sm text-slate-400 flex gap-2">
                  <span className="text-amber-500 mt-0.5">-</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
