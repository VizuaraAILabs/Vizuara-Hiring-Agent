'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import MarkdownViewer from '@/components/MarkdownViewer';
import ArcSpinner from '@/components/ArcSpinner';

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { session, loading, error, startSession } = useSession(token);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    if (session?.status === 'active') {
      router.push(`/session/${token}/terminal`);
    }
  }, [router, session?.status, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <ArcSpinner label="Loading session" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="text-center relative max-w-md px-5">
          <h1 className="text-2xl font-serif italic text-white mb-2">{error?.title ?? 'Session unavailable'}</h1>
          <p className="text-neutral-500">{error?.message ?? 'This session link may be invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  if (session.status === 'completed' || session.status === 'queued' || session.status === 'analyzing' || session.status === 'analyzed' || session.status === 'analysis failed') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="text-center relative">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-serif italic text-white mb-2">Session Complete</h1>
          <p className="text-neutral-500">Thank you for completing the assessment.</p>
        </div>
      </div>
    );
  }

  if (session.status === 'active') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <ArcSpinner label="Opening workspace" />
      </div>
    );
  }

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    setStartError('');
    const result = await startSession();
    if (result.success) {
      router.push(`/session/${token}/terminal`);
      return;
    }
    setStartError(result.error || 'Could not start the session. Please try again.');
    setStarting(false);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-5 py-8 md:px-8 md:py-10 relative">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute right-0 top-0 h-96 w-152 rounded-full bg-primary/7 blur-[150px] pointer-events-none" />

      <main className="relative mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-stretch">
        <section className="flex min-h-0 flex-col">
          <div className="px-6 py-6 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Challenge Brief</p>
            <h1 className="mt-3 text-3xl font-serif italic leading-tight text-white md:text-4xl">
              {session.challenge_title}
            </h1>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <p className="text-neutral-500">
                Welcome, <span className="font-medium text-primary">{session.candidate_name}</span>
              </p>
              <button
                onClick={handleStart}
                disabled={starting}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-black transition-all btn-glow hover:bg-primary-light active:translate-y-0.5 active:scale-[0.99] disabled:cursor-wait disabled:bg-primary-light sm:w-auto"
              >
                {starting && <ArcSpinner label="Starting challenge" sizeClassName="h-4 w-4" />}
                {starting ? 'Starting workspace...' : 'Start Challenge'}
              </button>
            </div>
            {startError && (
              <p className="mt-3 max-w-xl rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {startError}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-8">
            <MarkdownViewer content={session.challenge_description} className="max-w-4xl" />
          </div>
        </section>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-10 lg:max-h-[calc(100vh-5rem)]">
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-600">Ready Check</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Time</p>
                <p className="mt-2 text-2xl font-semibold text-white">{session.time_limit_min}</p>
                <p className="text-xs text-neutral-500">minutes</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Status</p>
                <p className="mt-2 text-2xl font-semibold text-white">Pending</p>
                <p className="text-xs text-neutral-500">not timed yet</p>
              </div>
            </div>

            <div className="mt-5 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-300 text-sm font-semibold">Read BRIEF.md first</p>
              <p className="mt-1 text-sm leading-6 text-red-200/75">
                The workspace brief contains the complete objectives and requirements for the assessment.
              </p>
            </div>

            <ul className="mt-5 space-y-3 text-sm text-neutral-400">
              <li className="flex gap-3">
                <span className="text-primary mt-0.5 font-mono text-xs">01</span>
                <span>Type <strong className="text-white">claude</strong> in the terminal to launch Claude Code.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-0.5 font-mono text-xs">02</span>
                <span>The sandbox runs as a <strong className="text-white">non-root user</strong>. Commands requiring sudo or system-level package installation are not available.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-0.5 font-mono text-xs">03</span>
                <span>We evaluate how you collaborate with AI, not just the final output.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-0.5 font-mono text-xs">04</span>
                <span>The timer starts after your terminal and files are ready.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-0.5 font-mono text-xs">05</span>
                <span>The file explorer hides dotfiles (e.g. <strong className="text-white">.env</strong>, <strong className="text-white">.gitignore</strong>). Use the terminal (<strong className="text-white">ls -a</strong>, <strong className="text-white">cat</strong>, <strong className="text-white">vim</strong>) if you need to view or edit them.</span>
              </li>
            </ul>
          </div>

          <div className="p-6">
            {startError && (
              <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {startError}
              </p>
            )}
            <button
              onClick={handleStart}
              disabled={starting}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-black transition-all btn-glow hover:bg-primary-light active:translate-y-0.5 active:scale-[0.99] disabled:cursor-wait disabled:bg-primary-light disabled:shadow-[0_0_30px_rgba(0,168,84,0.35)]"
            >
              {starting && <ArcSpinner label="Starting challenge" sizeClassName="h-5 w-5" />}
              {starting ? 'Starting workspace...' : 'Start Challenge'}
            </button>
            <p className="mt-3 text-center text-xs text-neutral-600">
              Setting up your terminal workspace — this can take a moment during busy periods.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
