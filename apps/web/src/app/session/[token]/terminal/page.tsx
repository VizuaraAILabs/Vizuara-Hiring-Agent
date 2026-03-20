'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { useSession } from '@/hooks/useSession';
import dynamic from 'next/dynamic';
import TerminalToolbar from '@/components/terminal/TerminalToolbar';

// Dynamic imports to avoid SSR issues with xterm.js
const Terminal = dynamic(() => import('@/components/terminal/Terminal'), { ssr: false });
const FileExplorer = dynamic(() => import('@/components/terminal/FileExplorer'), { ssr: false });
const InterviewWidget = dynamic(() => import('@/components/terminal/InterviewWidget'), { ssr: false });

export default function TerminalPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { session, loading, error, endSession } = useSession(token);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const handleEnd = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setEndError(null);

    const confirmed = window.confirm(
      'Are you sure you want to end the session? This cannot be undone.'
    );

    if (!confirmed) {
      setEnding(false);
      return;
    }

    const success = await endSession();
    if (success) {
      router.push(`/session/${token}`);
    } else {
      setEndError('Failed to end session. Please try again.');
      setEnding(false);
    }
  }, [ending, endSession, router, token]);

  const handleExpired = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    const success = await endSession();
    if (success) {
      router.push(`/session/${token}`);
    } else {
      setEndError('Failed to mark session as ended. Please refresh the page.');
      setEnding(false);
    }
  }, [ending, endSession, router, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !session || session.status !== 'active') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-serif italic text-white mb-2">Session Unavailable</h1>
          <p className="text-neutral-500">This session is not currently active.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {endError && (
        <div className="bg-red-900/60 text-red-300 text-sm text-center px-4 py-2">
          {endError}
        </div>
      )}
      <TerminalToolbar
        challengeTitle={session.challenge_title}
        durationMinutes={session.time_limit_min}
        startedAt={session.started_at}
        onEnd={handleEnd}
        onExpired={handleExpired}
      />
      <div className="flex-1 flex overflow-hidden">
        <FileExplorer token={token} />
        <div className="flex-1 overflow-hidden">
          <Terminal token={token} />
        </div>
      </div>
      <InterviewWidget token={token} />
    </div>
  );
}
