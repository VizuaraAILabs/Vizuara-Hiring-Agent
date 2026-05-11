'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from '@/hooks/useSession';
import dynamic from 'next/dynamic';
import TerminalToolbar from '@/components/terminal/TerminalToolbar';
import ArcSpinner from '@/components/ArcSpinner';
import ConfirmationModal from '@/components/ConfirmationModal';

// Dynamic imports to avoid SSR issues with xterm.js
const Terminal = dynamic(() => import('@/components/terminal/Terminal'), { ssr: false });
const FileExplorer = dynamic(() => import('@/components/terminal/FileExplorer'), { ssr: false });
const InterviewWidget = dynamic(() => import('@/components/terminal/InterviewWidget'), { ssr: false });
const COMPLETION_STATUSES = new Set(['completed', 'queued', 'analyzing', 'analyzed', 'analysis failed']);

export default function TerminalPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { session, loading, error, markWorkspaceReady, endSession } = useSession(token);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [terminalConnected, setTerminalConnected] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState('Starting terminal...');
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [filesReady, setFilesReady] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [markingReady, setMarkingReady] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const markingReadyRef = useRef(false);
  const workspaceReady = Boolean(
    session?.started_at && terminalConnected && filesReady && !terminalError && !filesError && !readyError
  );

  useEffect(() => {
    if (session && COMPLETION_STATUSES.has(session.status)) {
      router.replace(`/session/${token}`);
    }
  }, [router, session, token]);

  const handleEnd = useCallback(async () => {
    if (ending) return;
    setEndConfirmOpen(true);
  }, [ending]);

  const confirmEndSession = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setEndError(null);

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

  const handleFilesReadyChange = useCallback((ready: boolean, fileError?: string | null) => {
    setFilesReady(ready);
    setFilesError(fileError ?? null);
  }, []);

  useEffect(() => {
    if (!session || session.started_at || markingReadyRef.current) return;
    if (!terminalConnected || !filesReady || terminalError || filesError) return;

    let cancelled = false;
    markingReadyRef.current = true;
    queueMicrotask(() => {
      if (cancelled) return;
      setMarkingReady(true);
      setReadyError(null);
    });

    markWorkspaceReady().then((success) => {
      if (cancelled) return;
      if (success) {
        setReadyError(null);
      } else {
        setReadyError('Workspace loaded, but the timer could not be started. Please refresh and try again.');
      }
    }).finally(() => {
      markingReadyRef.current = false;
      if (!cancelled) setMarkingReady(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    filesError,
    filesReady,
    markWorkspaceReady,
    session,
    terminalConnected,
    terminalError,
  ]);

  if (loading) {
    return (
      <WorkspaceBootScreen
        terminalConnected={false}
        terminalStatus="Loading workspace..."
        terminalError={null}
        filesReady={false}
        filesError={null}
        markingReady={false}
        readyError={null}
        helperText={null}
      />
    );
  }

  if (session && COMPLETION_STATUSES.has(session.status)) {
    return (
      <WorkspaceBootScreen
        terminalConnected={false}
        terminalStatus="Completing session..."
        terminalError={null}
        filesReady={false}
        filesError={null}
        markingReady={false}
        readyError={null}
        helperText="Your session is complete. Taking you to the completion screen..."
      />
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
    <div className="h-screen bg-[#0a0a0a] relative overflow-hidden">
      {!workspaceReady && (
        <WorkspaceBootScreen
          terminalConnected={terminalConnected}
          terminalStatus={terminalStatus}
          terminalError={terminalError}
          filesReady={filesReady}
          filesError={filesError}
          markingReady={markingReady}
          readyError={readyError}
          helperText={null}
        />
      )}
      <div className={`h-full flex flex-col ${workspaceReady ? '' : 'invisible'}`}>
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
        {terminalConnected && (
          <FileExplorer token={token} onReadyChange={handleFilesReadyChange} />
        )}
        <div className="flex-1 overflow-hidden">
          <Terminal
            token={token}
            onConnectionChange={setTerminalConnected}
            onStatusChange={setTerminalStatus}
            onErrorChange={setTerminalError}
          />
        </div>
      </div>
      <InterviewWidget token={token} />
      </div>
      <ConfirmationModal
        open={endConfirmOpen}
        title="End Session?"
        description="This will close the candidate workspace and submit the current session for completion. This action cannot be undone."
        confirmLabel="End Session"
        cancelLabel="Keep Working"
        variant="danger"
        isLoading={ending}
        error={endError}
        onConfirm={confirmEndSession}
        onClose={() => setEndConfirmOpen(false)}
      />
    </div>
  );
}

function WorkspaceBootScreen({
  terminalConnected,
  terminalStatus,
  terminalError,
  filesReady,
  filesError,
  markingReady,
  readyError,
  helperText,
}: {
  terminalConnected: boolean;
  terminalStatus: string;
  terminalError: string | null;
  filesReady: boolean;
  filesError: string | null;
  markingReady: boolean;
  readyError: string | null;
  helperText: string | null;
}) {
  const error = terminalError || readyError;
  const message = error
    ? 'Workspace could not start'
    : !terminalConnected
      ? terminalStatus || 'Starting terminal...'
      : !filesReady
        ? 'Loading workspace files...'
        : markingReady
          ? 'Starting timer...'
          : 'Opening workspace...';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
      <div className="absolute inset-0 bg-grid opacity-25" />
      <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
      <div className="relative flex flex-col items-center text-center">
        {error ? (
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-xl font-semibold text-red-300">
            !
          </div>
        ) : (
          <ArcSpinner label={message} sizeClassName="h-16 w-16" />
        )}
        <p className="mt-5 text-base font-medium text-white">{message}</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500">
          {error
            || (filesError && !filesReady
              ? `${filesError}. Retrying file load...`
              : helperText || 'Preparing your terminal and files. Your assessment timer will start only after the workspace is ready.')}
        </p>
      </div>
    </div>
  );
}
