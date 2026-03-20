'use client';

import { useEffect } from 'react';
import { X, Quote, CheckCircle2 } from 'lucide-react';
import { getScoreColor, getScoreBgColor } from '@/lib/utils';
import type { DimensionDetail } from '@/types';

interface DimensionEvidenceModalProps {
  dimensionKey: string;
  label: string;
  score: number;
  detail: DimensionDetail;
  onClose: () => void;
}

export default function DimensionEvidenceModal({
  label,
  score,
  detail,
  onClose,
}: DimensionEvidenceModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasPoints = detail.observed_points && detail.observed_points.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-base">{label}</span>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${getScoreBgColor(score)} text-white`}
            >
              {score.toFixed(0)} / 100
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white cursor-pointer transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Narrative */}
          {detail.narrative && (
            <p className="text-sm text-neutral-300 leading-relaxed">{detail.narrative}</p>
          )}

          {/* Expected Standard */}
          {detail.expected_standard && (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={14} className="text-[#00a854]" />
                <span className="text-xs font-semibold text-[#00a854] uppercase tracking-wide">
                  Expected Standard
                </span>
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">{detail.expected_standard}</p>
            </div>
          )}

          {/* Evidence table */}
          <div>
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
              Evidence Breakdown
            </h4>

            {!hasPoints ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
                <p className="text-sm text-neutral-600">
                  Detailed evidence is not available for this analysis.
                  Re-run analysis to generate transcript-grounded evidence.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-2 border-b border-white/5 bg-white/[0.03]">
                  <div className="px-4 py-2.5 text-xs font-semibold text-neutral-400 uppercase tracking-wide border-r border-white/5">
                    Observed
                  </div>
                  <div className="px-4 py-2.5 text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                    Expected
                  </div>
                </div>

                {/* Rows */}
                {detail.observed_points!.map((point, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-2 ${i < detail.observed_points!.length - 1 ? 'border-b border-white/5' : ''}`}
                  >
                    {/* Observed column */}
                    <div className="px-4 py-4 border-r border-white/5 space-y-2.5">
                      {/* Transcript quote */}
                      <div className="flex items-start gap-2">
                        <Quote size={12} className="text-neutral-600 mt-0.5 shrink-0" />
                        <span className="text-xs font-mono text-neutral-300 leading-relaxed bg-white/[0.04] px-2.5 py-1.5 rounded-lg border border-white/5 block w-full">
                          {point.transcript_quote}
                        </span>
                      </div>
                      {/* Observation analysis */}
                      <p className="text-xs text-neutral-500 leading-relaxed pl-5">
                        {point.observation}
                      </p>
                    </div>

                    {/* Expected column */}
                    <div className="px-4 py-4">
                      <p className={`text-xs leading-relaxed ${getScoreColor(score)}`}>
                        {point.comparison}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
