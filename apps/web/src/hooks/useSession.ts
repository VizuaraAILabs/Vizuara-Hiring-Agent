'use client';

import { useState, useEffect } from 'react';
import type { SessionWithChallenge } from '@/types';

export function useSession(token: string) {
  const [session, setSession] = useState<SessionWithChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSession = () =>
      fetch(`/api/sessions/${token}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('Session not found');
          return res.json();
        })
        .then((data) => { if (!cancelled) setSession(data); })
        .catch((err) => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setLoading(false); });

    fetchSession();
    const interval = setInterval(fetchSession, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const startSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${token}/start`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setSession((prev) => prev ? { ...prev, ...updated } : null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const endSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${token}/end`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setSession((prev) => prev ? { ...prev, ...updated } : null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return { session, loading, error, startSession, endSession };
}
