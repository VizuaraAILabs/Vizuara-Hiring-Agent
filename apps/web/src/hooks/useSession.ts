'use client';

import { useState, useEffect } from 'react';
import { getCandidateUnavailableCopy, isCandidateUnavailableReason, type CandidateUnavailableReason } from '@/lib/candidate-unavailable';
import type { SessionWithChallenge } from '@/types';

interface CandidateSessionError {
  title: string;
  message: string;
  reason: CandidateUnavailableReason | null;
}

interface CandidateSessionActionResult {
  success: boolean;
  error: string | null;
  title?: string;
  reason?: CandidateUnavailableReason | null;
}

export function useSession(token: string) {
  const [session, setSession] = useState<SessionWithChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CandidateSessionError | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSession = () =>
      fetch(`/api/sessions/${token}`)
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            const reason = isCandidateUnavailableReason(data?.reason)
              ? data.reason
              : res.status === 404
                ? 'invalid_link'
                : 'temporarily_unavailable';
            const copy = getCandidateUnavailableCopy(reason, data?.error);
            throw {
              title: data?.title || copy.title,
              message: isCandidateUnavailableReason(data?.reason) ? data?.error || copy.message : copy.message,
              reason,
            };
          }
          return res.json();
        })
        .then((data) => {
          if (!cancelled) {
            setSession(data);
            setError(null);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          const fallback = getCandidateUnavailableCopy('temporarily_unavailable');
          setError({
            title: typeof err?.title === 'string' ? err.title : fallback.title,
            message: typeof err?.message === 'string' ? err.message : fallback.message,
            reason: isCandidateUnavailableReason(err?.reason) ? err.reason : null,
          });
        })
        .finally(() => { if (!cancelled) setLoading(false); });

    fetchSession();
    const interval = setInterval(fetchSession, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const startSession = async (): Promise<CandidateSessionActionResult> => {
    try {
      const res = await fetch(`/api/sessions/${token}/start`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setSession((prev) => prev ? { ...prev, ...updated } : null);
        return { success: true, error: null };
      }
      const data = await res.json().catch(() => null);
      const reason = isCandidateUnavailableReason(data?.reason) ? data.reason : null;
      const copy = getCandidateUnavailableCopy(reason, data?.error);
      return {
        success: false,
        error: data?.error || copy.message,
        title: data?.title || copy.title,
        reason,
      };
    } catch {
      return { success: false, error: 'Could not start the session. Please try again.' };
    }
  };

  const markWorkspaceReady = async () => {
    try {
      const res = await fetch(`/api/sessions/${token}/ready`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setSession((prev) => prev ? { ...prev, ...updated } : updated);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const endSession = async (reason?: string) => {
    try {
      const res = await fetch(`/api/sessions/${token}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
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

  return { session, loading, error, startSession, markWorkspaceReady, endSession };
}
