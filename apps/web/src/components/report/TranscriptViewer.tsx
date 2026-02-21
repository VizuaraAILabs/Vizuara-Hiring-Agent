'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Interaction } from '@/types';

interface TranscriptViewerProps {
  interactions: Interaction[];
  highlightIndex?: number;
}

const typeStyles: Record<string, { label: string; color: string; bg: string }> = {
  prompt: { label: 'PROMPT', color: 'text-cyan-400', bg: 'bg-cyan-500/5 border-l-cyan-500' },
  command: { label: 'CMD', color: 'text-amber-400', bg: 'bg-amber-500/5 border-l-amber-500' },
  response: { label: 'AI', color: 'text-violet-400', bg: 'bg-violet-500/5 border-l-violet-500' },
  terminal: { label: 'OUT', color: 'text-slate-500', bg: 'bg-slate-500/5 border-l-slate-700' },
};

export default function TranscriptViewer({ interactions, highlightIndex }: TranscriptViewerProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightIndex !== undefined && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightIndex]);

  const filtered = filter
    ? interactions.filter((i) => i.content_type === filter)
    : interactions;

  const filters = [
    { value: null, label: 'All' },
    { value: 'prompt', label: 'Prompts' },
    { value: 'command', label: 'Commands' },
    { value: 'response', label: 'AI Responses' },
    { value: 'terminal', label: 'Terminal' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Transcript</h3>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.value ?? 'all'}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto space-y-2 pr-2">
        {filtered.map((interaction, i) => {
          const style = typeStyles[interaction.content_type] || typeStyles.terminal;
          const isHighlighted = interaction.sequence_num === highlightIndex;

          return (
            <div
              key={interaction.id || i}
              ref={isHighlighted ? highlightRef : undefined}
              className={`border-l-2 rounded-r-lg p-3 ${style.bg} ${
                isHighlighted ? 'ring-2 ring-cyan-400' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase ${style.color}`}>
                  {style.label}
                </span>
                <span className="text-[10px] text-slate-600">
                  #{interaction.sequence_num}
                </span>
                <span className="text-[10px] text-slate-700">
                  {interaction.timestamp}
                </span>
              </div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                {interaction.content}
              </pre>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-slate-600 py-8 text-sm">No interactions to display</p>
        )}
      </div>
    </div>
  );
}
