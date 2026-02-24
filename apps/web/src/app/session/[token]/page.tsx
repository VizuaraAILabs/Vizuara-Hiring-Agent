'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import FPLLogo from '@/components/FPLLogo';

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { session, loading, error, startSession } = useSession(token);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[#00a854] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="text-center relative">
          <h1 className="text-2xl font-serif italic text-white mb-2">Session Not Found</h1>
          <p className="text-neutral-500">This session link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  if (session.status === 'completed' || session.status === 'analyzed') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="text-center relative">
          <div className="w-16 h-16 rounded-full bg-[#00a854]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#00a854]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#00a854]/5 blur-[120px] pointer-events-none" />

      <div className="max-w-2xl w-full relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <FPLLogo size={26} />
            <span className="text-sm font-semibold text-white">
              Arc<span className="text-[#00a854]">Eval</span>
            </span>
          </div>
          <h1 className="text-3xl font-serif italic text-white mb-2">{session.challenge_title}</h1>
          <p className="text-neutral-500">
            Welcome, <span className="text-[#00a854] font-medium">{session.candidate_name}</span>
          </p>
        </div>

        <div className="bg-[#111] border border-white/5 rounded-2xl p-8 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Challenge Description</h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-neutral-400 text-sm leading-relaxed font-sans">
              {session.challenge_description}
            </pre>
          </div>
        </div>

        <div className="bg-[#111] border border-white/5 rounded-2xl p-8 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Before You Start</h2>
          <ul className="space-y-3 text-sm text-neutral-500">
            <li className="flex gap-3">
              <span className="text-[#00a854] mt-0.5 font-mono text-xs">01</span>
              <span>You have <strong className="text-white">{session.time_limit_min} minutes</strong> to complete this challenge.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#00a854] mt-0.5 font-mono text-xs">02</span>
              <span>You&apos;ll work in a browser terminal with access to <strong className="text-white">Claude Code</strong> as your AI assistant.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#00a854] mt-0.5 font-mono text-xs">03</span>
              <span>We evaluate <strong className="text-white">how you collaborate with AI</strong>, not just the final output.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#00a854] mt-0.5 font-mono text-xs">04</span>
              <span>Think out loud, break the problem down, and iterate on your approach.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#00a854] mt-0.5 font-mono text-xs">05</span>
              <span>The timer starts when you click &quot;Start Challenge&quot; below.</span>
            </li>
          </ul>
        </div>

        <div className="text-center">
          <button
            onClick={handleStart}
            className="bg-[#00a854] hover:bg-[#00c96b] text-black font-semibold px-10 py-4 rounded-xl text-lg transition-all btn-glow"
          >
            Start Challenge
          </button>
        </div>
      </div>
    </div>
  );
}
