'use client';

import SessionTimer from './SessionTimer';

interface TerminalToolbarProps {
  challengeTitle: string;
  durationMinutes: number;
  startedAt: string | null;
  onEnd: () => void;
  onExpired: () => void;
}

export default function TerminalToolbar({
  challengeTitle,
  durationMinutes,
  startedAt,
  onEnd,
  onExpired,
}: TerminalToolbarProps) {
  return (
    <div className="flex items-center justify-between bg-[#111] border-b border-white/5 px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-amber-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <h2 className="text-white font-medium text-sm">{challengeTitle}</h2>
      </div>

      <div className="flex items-center gap-4">
        <SessionTimer
          durationMinutes={durationMinutes}
          startedAt={startedAt}
          onExpired={onExpired}
        />
        <button
          onClick={onEnd}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          End Session
        </button>
      </div>
    </div>
  );
}
