'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ArcSpinner from '@/components/ArcSpinner';
import { getCandidateUnavailableCopy, isCandidateUnavailableReason } from '@/lib/candidate-unavailable';

interface ChallengeInfo {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  company_name: string;
  starts_at: string | null;
  ends_at: string | null;
  availability?: {
    ok: boolean;
    reason: string;
    title?: string;
    message: string;
  };
}

export default function ApplyPage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = params.id as string;

  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const isUnavailable = Boolean(challenge?.availability && !challenge.availability.ok);

  function formatWindowDate(value: string | null) {
    if (!value) return null;
    return new Date(value).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  useEffect(() => {
    fetch(`/api/challenges/${challengeId}/apply`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const reason = isCandidateUnavailableReason(data?.reason)
            ? data.reason
            : res.status === 404
              ? 'invalid_link'
              : 'temporarily_unavailable';
          const copy = getCandidateUnavailableCopy(reason);
          throw {
            title: data?.title || copy.title,
            message: isCandidateUnavailableReason(data?.reason) ? data.error || copy.message : copy.message,
          };
        }
        return res.json();
      })
      .then((data) => setChallenge(data))
      .catch((err) => setError({
        title: typeof err?.title === 'string' ? err.title : getCandidateUnavailableCopy('temporarily_unavailable').title,
        message: typeof err?.message === 'string' ? err.message : getCandidateUnavailableCopy('temporarily_unavailable').message,
      }))
      .finally(() => setLoading(false));
  }, [challengeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isUnavailable) return;

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
        <ArcSpinner label="Loading assessment" />
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative px-4">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="text-center relative">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <span className="text-sm font-semibold text-white">
              Arc<span className="text-primary">Eval</span>
            </span>
          </div>
          <h1 className="text-2xl font-serif italic text-white mb-2">{error?.title ?? 'Assessment link not found'}</h1>
          <p className="text-neutral-500">{error?.message ?? 'This assessment link may be invalid or no longer available.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-5 py-8 md:px-8 md:py-10 relative">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute left-1/2 top-0 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-primary/8 blur-[140px] pointer-events-none" />

      <main className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,500px)] lg:items-stretch">
          <section className="flex min-h-130 flex-col justify-between p-7 md:p-10">
            <div>
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                Candidate Assessment
              </p>
              <p className="mb-4 text-xl font-semibold text-white md:text-2xl">
                {challenge.company_name}
              </p>
              <h1 className="max-w-3xl text-4xl font-serif italic leading-tight text-white md:text-5xl">
                {challenge.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400">
                Confirm your details to continue. The full challenge brief appears on the next screen before the timer starts.
              </p>
            </div>

            <div className="grid gap-3 border-t border-white/8 pt-6 text-sm text-neutral-400 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Duration</p>
                <p className="mt-2 text-lg font-semibold text-white">{challenge.time_limit_min} min</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Format</p>
                <p className="mt-2 text-lg font-semibold text-white">Live workspace</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Focus</p>
                <p className="mt-2 text-lg font-semibold text-white">AI collaboration</p>
              </div>
            </div>
          </section>

          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold text-white">Enter Your Details</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-500">
                Use the same name and email you want associated with this assessment submission.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {isUnavailable && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-200">
                    {challenge.availability?.title ?? 'Assessment unavailable'}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-100/80">{challenge.availability?.message}</p>
                  {(challenge.starts_at || challenge.ends_at) && (
                    <p className="mt-1 text-xs leading-5 text-amber-100/70">
                      {challenge.starts_at ? `Opens ${formatWindowDate(challenge.starts_at)}` : 'Open now'}
                      {challenge.ends_at ? ` - closes ${formatWindowDate(challenge.ends_at)}` : ''}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                  disabled={isUnavailable}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  disabled={isUnavailable}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
                  required
                />
              </div>

              {submitError && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitting || isUnavailable}
                className="w-full bg-primary hover:bg-primary-light disabled:opacity-70 text-black py-4 rounded-xl text-sm font-semibold transition-all btn-glow mt-2 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating your session...' : 'Continue to Assessment'}
              </button>
            </form>

            <p className="mt-7 border-t border-white/8 pt-5 text-center text-xs text-neutral-700">
              Powered by <span className="text-neutral-500">ArcEval</span> - AI Collaboration Assessment
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
