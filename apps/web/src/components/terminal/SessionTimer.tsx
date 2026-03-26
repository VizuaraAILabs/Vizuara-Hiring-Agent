'use client';

import { useEffect } from 'react';
import { useTimer } from '@/hooks/useTimer';

interface SessionTimerProps {
  durationMinutes: number;
  startedAt: string | null;
  onExpired?: () => void;
}

export default function SessionTimer({ durationMinutes, startedAt, onExpired }: SessionTimerProps) {
  const { formattedTime, isExpired, isWarning, isCritical } = useTimer(durationMinutes, startedAt);

  useEffect(() => {
    if (isExpired && onExpired) {
      onExpired();
    }
  }, [isExpired, onExpired]);

  return (
    <div
      className={`font-mono text-lg font-bold px-4 py-2 rounded-lg ${
        isCritical
          ? 'bg-red-500/20 text-red-400 animate-pulse'
          : isWarning
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-white/5 text-white'
      }`}
    >
      {formattedTime}
    </div>
  );
}
