'use client';

import { useState, useEffect } from 'react';
import type { SessionWithChallenge } from '@/types';

export function useSession(token: string) {
  const [session, setSession] = useState<SessionWithChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Session not found');
        return res.json();
      })
      .then(setSession)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const startSession = async () => {
    const res = await fetch(`/api/sessions/${token}/start`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      setSession((prev) => prev ? { ...prev, ...updated } : null);
      return true;
    }
    return false;
  };

  const endSession = async () => {
    const res = await fetch(`/api/sessions/${token}/end`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      setSession((prev) => prev ? { ...prev, ...updated } : null);
      return true;
    }
    return false;
  };

  return { session, loading, error, startSession, endSession };
}
