'use client';

import { useState } from 'react';
import { AlertCircle, Eye, Loader2, RefreshCw } from 'lucide-react';
import { getScoreColor, getScoreBgColor } from '@/lib/utils';
import type { DimensionDetail } from '@/types';
import DimensionEvidenceModal from './DimensionEvidenceModal';

interface ScoreSummaryProps {
  dimensions: Record<string, DimensionDetail>;
  scores: Record<string, number>;
  enriching?: boolean;
  enrichmentError?: string | null;
  onRetryEnrichment?: () => void;
  challengeTitle?: string | null;
  challengeRole?: string | null;
  challengeTechStack?: string | null;
  challengeSeniority?: string | null;
  challengeFocusAreas?: string | null;
  challengeContext?: string | null;
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

export default function ScoreSummary({ dimensions, scores, enriching = false, enrichmentError, onRetryEnrichment, challengeTitle, challengeRole, challengeTechStack, challengeSeniority, challengeFocusAreas, challengeContext }: ScoreSummaryProps) {
  const [openDimension, setOpenDimension] = useState<string | null>(null);
  const entries = Object.entries(dimensionLabels);

  const openDetail = openDimension ? dimensions[openDimension] : null;

  return (
    <>
      <div className="bg-surface border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Score Breakdown</h3>
          {enriching && (
            <div className="flex items-center gap-1.5 text-neutral-600 text-xs">
              <Loader2 size={12} className="animate-spin" />
              <span>Generating evidence…</span>
            </div>
          )}
        </div>
        {enrichmentError && !enriching && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs text-amber-200">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{enrichmentError}</span>
            </div>
            {onRetryEnrichment && (
              <button
                type="button"
                onClick={onRetryEnrichment}
                className="inline-flex items-center gap-1.5 self-start rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-400/10 sm:self-auto"
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </div>
        )}
        <div className="space-y-5">
          {entries.map(([key, label]) => {
            const score = scores[key] ?? 0;
            const detail = dimensions[key];
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-300">{label}</span>
                    <button
                      onClick={() => setOpenDimension(key)}
                      className="text-neutral-600 hover:text-neutral-200 cursor-pointer transition-colors"
                      title={`View evidence for ${label}`}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                  <span className={`text-sm font-bold ${getScoreColor(score)}`}>
                    {score.toFixed(0)}
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getScoreBgColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                {detail?.narrative && (
                  <p className="text-xs text-neutral-600 mt-1.5 line-clamp-2">{detail.narrative}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {openDimension && openDetail && (
        <DimensionEvidenceModal
          dimensionKey={openDimension}
          label={dimensionLabels[openDimension]}
          score={scores[openDimension] ?? 0}
          detail={openDetail}
          onClose={() => setOpenDimension(null)}
          challengeTitle={challengeTitle}
          challengeRole={challengeRole}
          challengeTechStack={challengeTechStack}
          challengeSeniority={challengeSeniority}
          challengeFocusAreas={challengeFocusAreas}
          challengeContext={challengeContext}
        />
      )}
    </>
  );
}
