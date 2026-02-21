'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { session, loading, error, startSession } = useSession(token);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Session Not Found</h1>
          <p className="text-slate-400">This session link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  if (session.status === 'completed' || session.status === 'analyzed') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Session Complete</h1>
          <p className="text-slate-400">Thank you for completing the assessment.</p>
        </div>
      </div>
    );
  }

  if (session.status === 'active') {
    router.push(`/session/${token}/terminal`);
    return null;
  }

  async function handleStart() {
    const success = await startSession();
    if (success) {
      router.push(`/session/${token}/terminal`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">{session.challenge_title}</h1>
          <p className="text-slate-400">
            Welcome, <span className="text-cyan-400">{session.candidate_name}</span>
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Challenge Description</h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-slate-300 text-sm leading-relaxed font-sans">
              {session.challenge_description}
            </pre>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Before You Start</h2>
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex gap-3">
              <span className="text-cyan-400 mt-0.5">1.</span>
              <span>You have <strong className="text-white">{session.time_limit_min} minutes</strong> to complete this challenge.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-cyan-400 mt-0.5">2.</span>
              <span>You&apos;ll work in a browser terminal with access to <strong className="text-white">Claude Code</strong> as your AI assistant.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-cyan-400 mt-0.5">3.</span>
              <span>We evaluate <strong className="text-white">how you collaborate with AI</strong>, not just the final output.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-cyan-400 mt-0.5">4.</span>
              <span>Think out loud, break the problem down, and iterate on your approach.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-cyan-400 mt-0.5">5.</span>
              <span>The timer starts when you click &quot;Start Challenge&quot; below.</span>
            </li>
          </ul>
        </div>

        <div className="text-center">
          <button
            onClick={handleStart}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
          >
            Start Challenge
          </button>
        </div>
      </div>
    </div>
  );
}
