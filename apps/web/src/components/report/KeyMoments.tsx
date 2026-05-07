'use client';

import type { KeyMoment } from '@/types';

interface KeyMomentsProps {
  moments: KeyMoment[];
  onViewInTranscript?: (index: number) => void;
}

const typeConfig: Record<string, { color: string; bg: string; label: string }> = {
  strength: { color: 'text-primary', bg: 'bg-primary/5 border-primary/20', label: 'Strength' },
  weakness: { color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20', label: 'Weakness' },
  pivot: { color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20', label: 'Pivot' },
  insight: { color: 'text-violet-400', bg: 'bg-violet-500/5 border-violet-500/20', label: 'Insight' },
};

export default function KeyMoments({ moments, onViewInTranscript }: KeyMomentsProps) {
  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Key Moments</h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-white/5" />

        <div className="space-y-4">
          {moments.map((moment, i) => {
            const config = typeConfig[moment.type] || typeConfig.insight;
            return (
              <div key={i} className="relative pl-10">
                {/* Dot */}
                <div
                  className={`absolute left-2.5 top-3 w-3 h-3 rounded-full border-2 ${config.bg} border-current ${config.color}`}
                />

                <div className={`border rounded-xl p-4 ${config.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${config.color}`}>
                        {config.label}
                      </span>
                      {moment.timestamp && (
                        <span className="text-xs text-neutral-600">{moment.timestamp}</span>
                      )}
                    </div>
                    {moment.interaction_index !== undefined && onViewInTranscript && (
                      <button
                        onClick={() => onViewInTranscript(moment.interaction_index!)}
                        className="text-xs text-primary hover:text-primary-light"
                      >
                        View in transcript
                      </button>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-white mb-1">{moment.title}</h4>
                  <p className="text-xs text-neutral-500">{moment.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
