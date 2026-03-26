'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useTimer(durationMinutes: number, startedAt: string | null) {
  const [timeRemaining, setTimeRemaining] = useState<number>(durationMinutes * 60);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Difference: client time - server time (ms). Positive means client is ahead.
  const clockOffsetRef = useRef<number>(0);
  const offsetFetchedRef = useRef(false);

  useEffect(() => {
    if (offsetFetchedRef.current) return;
    offsetFetchedRef.current = true;
    const before = Date.now();
    fetch('/api/time')
      .then((r) => r.json())
      .then(({ now }: { now: string }) => {
        const after = Date.now();
        const serverTime = new Date(now).getTime();
        // Use midpoint of the request to approximate when the server responded.
        clockOffsetRef.current = Math.round((before + after) / 2) - serverTime;
      })
      .catch(() => {
        // Fall back to 0 offset — no worse than the original behaviour.
      });
  }, []);

  const calculateRemaining = useCallback(() => {
    if (!startedAt) return durationMinutes * 60;
    // Correct client's Date.now() by the measured offset to get server-equivalent time.
    const serverNow = Date.now() - clockOffsetRef.current;
    const elapsed = Math.floor((serverNow - new Date(startedAt).getTime()) / 1000);
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
