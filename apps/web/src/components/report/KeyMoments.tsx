'use client';

import type { KeyMoment } from '@/types';

interface KeyMomentsProps {
  moments: KeyMoment[];
  onViewInTranscript?: (index: number) => void;
}

const typeConfig: Record<string, { color: string; bg: string; label: string }> = {
  strength: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Strength' },
  weakness: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Weakness' },
  pivot: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Pivot' },
  insight: { color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', label: 'Insight' },
};

export default function KeyMoments({ moments, onViewInTranscript }: KeyMomentsProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Key Moments</h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-800" />

        <div className="space-y-4">
          {moments.map((moment, i) => {
            const config = typeConfig[moment.type] || typeConfig.insight;
            return (
              <div key={i} className="relative pl-10">
                {/* Dot */}
                <div
                  className={`absolute left-2.5 top-3 w-3 h-3 rounded-full border-2 ${config.bg} border-current ${config.color}`}
                />

                <div className={`border rounded-lg p-4 ${config.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${config.color}`}>
                        {config.label}
                      </span>
                      {moment.timestamp && (
                        <span className="text-xs text-slate-600">{moment.timestamp}</span>
                      )}
                    </div>
                    {moment.interaction_index !== undefined && onViewInTranscript && (
                      <button
                        onClick={() => onViewInTranscript(moment.interaction_index!)}
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        View in transcript
                      </button>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-white mb-1">{moment.title}</h4>
                  <p className="text-xs text-slate-400">{moment.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
