'use client';

import { useState, useRef, useEffect } from 'react';
import type { Interaction } from '@/types';

interface TranscriptViewerProps {
  interactions: Interaction[];
  highlightIndex?: number;
}

// Strip ANSI escape sequences and control characters from terminal output
function stripAnsi(str: string): string {
  return str
    // CSI sequences (e.g. colors, cursor movement, bracketed paste mode)
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    // OSC sequences
    .replace(/\x1B\][^\x07]*\x07/g, '')
    // Other ESC sequences
    .replace(/\x1B[()][AB012]/g, '')
    .replace(/\x1B[78DEHM=>Nc]/g, '')
    // Remaining bare ESC chars
    .replace(/\x1B/g, '')
    // Non-printable control characters (except tab, newline, carriage return)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

const typeStyles: Record<string, { label: string; color: string; bg: string }> = {
  prompt: { label: 'PROMPT', color: 'text-[#00a854]', bg: 'bg-[#00a854]/5 border-l-[#00a854]' },
  command: { label: 'CMD', color: 'text-amber-400', bg: 'bg-amber-500/5 border-l-amber-500' },
  response: { label: 'AI', color: 'text-violet-400', bg: 'bg-violet-500/5 border-l-violet-500' },
  terminal: { label: 'OUT', color: 'text-neutral-500', bg: 'bg-neutral-500/5 border-l-neutral-700' },
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
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Transcript</h3>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.value ?? 'all'}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-neutral-600 hover:text-neutral-300 hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-150 overflow-y-auto space-y-2 pr-2">
        {filtered.map((interaction, i) => {
          const style = typeStyles[interaction.content_type] || typeStyles.terminal;
          const isHighlighted = interaction.sequence_num === highlightIndex;

          return (
            <div
              key={interaction.id || i}
              ref={isHighlighted ? highlightRef : undefined}
              className={`border-l-2 rounded-r-xl p-3 ${style.bg} ${
                isHighlighted ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase ${style.color}`}>
                  {style.label}
                </span>
                <span className="text-[10px] text-neutral-600">
                  #{interaction.sequence_num}
                </span>
                <span className="text-[10px] text-neutral-700">
                  {interaction.timestamp}
                </span>
              </div>
              <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                {stripAnsi(interaction.content)}
              </pre>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-neutral-600 py-8 text-sm">No interactions to display</p>
        )}
      </div>
    </div>
  );
}
