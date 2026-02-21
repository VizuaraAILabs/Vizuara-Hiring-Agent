'use client';

import { getScoreColor, getScoreBgColor } from '@/lib/utils';
import type { DimensionDetail } from '@/types';

interface ScoreSummaryProps {
  dimensions: Record<string, DimensionDetail>;
  scores: Record<string, number>;
}

const dimensionLabels: Record<string, string> = {
  problem_decomposition: 'Problem Decomposition',
  first_principles: 'First Principles',
  creativity: 'Creativity & Innovation',
  iteration_quality: 'Iteration Quality',
  debugging_approach: 'Debugging Approach',
  architecture_thinking: 'Architecture Thinking',
  communication_clarity: 'Communication Clarity',
  efficiency: 'Efficiency',
};

export default function ScoreSummary({ dimensions, scores }: ScoreSummaryProps) {
  const entries = Object.entries(dimensionLabels);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Score Breakdown</h3>
      <div className="space-y-5">
        {entries.map(([key, label]) => {
          const score = scores[key] ?? 0;
          const detail = dimensions[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">{label}</span>
                <span className={`text-sm font-bold ${getScoreColor(score)}`}>
                  {score.toFixed(0)}
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getScoreBgColor(score)}`}
                  style={{ width: `${score}%` }}
                />
              </div>
              {detail?.narrative && (
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{detail.narrative}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
