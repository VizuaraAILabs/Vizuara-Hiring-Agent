'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useTimer(durationMinutes: number, startedAt: string | null) {
  const [timeRemaining, setTimeRemaining] = useState<number>(durationMinutes * 60);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateRemaining = useCallback(() => {
    if (!startedAt) return durationMinutes * 60;
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, durationMinutes * 60 - elapsed);
  }, [durationMinutes, startedAt]);

  useEffect(() => {
    if (!startedAt) return;

    const update = () => {
      const remaining = calculateRemaining();
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        setIsExpired(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt, calculateRemaining]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isWarning = timeRemaining <= 300 && timeRemaining > 60;
  const isCritical = timeRemaining <= 60;

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    isExpired,
    isWarning,
    isCritical,
  };
}
