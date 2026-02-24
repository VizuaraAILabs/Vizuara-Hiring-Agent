'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import VizuaraLogo from '@/components/VizuaraLogo';

interface ChallengeInfo {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  company_name: string;
}

export default function ApplyPage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = params.id as string;

  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch(`/api/challenges/${challengeId}/apply`)
      .then((res) => {
        if (!res.ok) throw new Error('Challenge not found');
        return res.json();
      })
      .then((data) => setChallenge(data))
      .catch(() => setError('This challenge link is invalid or no longer available.'))
      .finally(() => setLoading(false));
  }, [challengeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: form.name,
          candidate_email: form.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      // Redirect to the session page
      router.push(`/session/${data.token}`);
    } catch {
      setSubmitError('Failed to connect. Please check your internet and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[#00a854] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative px-4">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="text-center relative">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <VizuaraLogo size={26} />
            <span className="text-sm font-semibold text-white">
              Arc<span className="text-[#00a854]">Eval</span>
            </span>
          </div>
          <h1 className="text-2xl font-serif italic text-white mb-2">Challenge Not Found</h1>
          <p className="text-neutral-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#00a854]/5 blur-[120px] pointer-events-none" />

      <div className="max-w-lg w-full relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <VizuaraLogo size={26} />
            <span className="text-sm font-semibold text-white">
              Arc<span className="text-[#00a854]">Eval</span>
            </span>
          </div>
          <p className="text-neutral-600 text-sm mb-2">{challenge.company_name}</p>
          <h1 className="text-3xl font-serif italic text-white mb-2">{challenge.title}</h1>
          <p className="text-neutral-500 text-sm">
            {challenge.time_limit_min} minute timed assessment
          </p>
        </div>

        <div className="bg-[#111] border border-white/5 rounded-2xl p-8 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Enter Your Details</h2>
          <p className="text-neutral-500 text-sm mb-6">
            Please provide your information to begin the assessment. You&apos;ll see the full challenge description on the next screen.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-500 mb-1">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 transition-all placeholder:text-neutral-700"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-500 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 transition-all placeholder:text-neutral-700"
                required
              />
            </div>

            {submitError && (
              <p className="text-red-400 text-sm">{submitError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-50 text-black py-3.5 rounded-xl text-sm font-semibold transition-all btn-glow mt-2"
            >
              {submitting ? 'Starting...' : 'Continue to Assessment'}
            </button>
          </form>
        </div>

        <div className="text-center">
          <p className="text-neutral-700 text-xs">
            Powered by <span className="text-neutral-500">ArcEval</span> &mdash; AI Collaboration Assessment
          </p>
        </div>
      </div>
    </div>
  );
}
