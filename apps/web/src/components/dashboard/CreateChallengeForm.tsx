'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StarterFilesEditor from './StarterFilesEditor';
import { useSubscription } from '@/context/SubscriptionContext';
import type { StarterFile } from '@/types';

export default function CreateChallengeForm() {
  const router = useRouter();
  const { planStatus } = useSubscription();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);
  const [sessionsLimit, setSessionsLimit] = useState<string>('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [starterFiles, setStarterFiles] = useState<StarterFile[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const availableAssessmentCount = planStatus?.sessionsLimit === -1
    ? null
    : planStatus
      ? Math.max(0, planStatus.sessionsLimit - planStatus.sessionsUsed)
      : undefined;

  useEffect(() => {
    const prefill = sessionStorage.getItem('prefill_challenge');
    if (prefill) {
      try {
        const data = JSON.parse(prefill);
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
        if (data.timeLimit) setTimeLimit(Math.max(10, Math.min(45, data.timeLimit)));
        if (data.sessionsLimit != null) setSessionsLimit(String(data.sessionsLimit));
        if (data.starterFiles) setStarterFiles(data.starterFiles);
        if (Array.isArray(data.allowedEmails)) setAllowedEmails(data.allowedEmails);
        if (data.startsAt) setStartsAt(data.startsAt);
        if (data.endsAt) setEndsAt(data.endsAt);
      } catch {
        // ignore invalid JSON
      }
      sessionStorage.removeItem('prefill_challenge');
    }
  }, []);

  function commitEmailDraft() {
    const trimmed = emailDraft.trim().toLowerCase();
    if (trimmed && !allowedEmails.includes(trimmed)) {
      setAllowedEmails((prev) => [...prev, trimmed]);
    }
    setEmailDraft('');
  }

  function handleEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      commitEmailDraft();
    } else if (e.key === 'Backspace' && emailDraft === '' && allowedEmails.length > 0) {
      setAllowedEmails((prev) => prev.slice(0, -1));
    }
  }

  function handleEmailPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const newEmails = pasted
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    setAllowedEmails((prev) => {
      const merged = [...prev];
      for (const email of newEmails) {
        if (!merged.includes(email)) merged.push(email);
      }
      return merged;
    });
    setEmailDraft('');
  }

  function handleSessionsLimitChange(value: string) {
    if (value === '') {
      setSessionsLimit('');
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    const normalized = Math.max(0, Math.floor(parsed));
    const capped = typeof availableAssessmentCount === 'number'
      ? Math.min(normalized, availableAssessmentCount)
      : normalized;
    setSessionsLimit(String(capped));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          time_limit_min: timeLimit,
          starter_files: starterFiles.length > 0 ? starterFiles : undefined,
          sessions_limit: sessionsLimit !== '' ? parseInt(sessionsLimit) : undefined,
          allowed_emails: allowedEmails.length > 0 ? allowedEmails : undefined,
          starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
          ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create challenge');
        return;
      }

      const challenge = await res.json();
      router.push(`/dashboard/challenges/${challenge.id}/starter-files`);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-400">Challenge Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white placeholder-neutral-600 transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="e.g., Build a REST API with Claude"
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-400">Description</label>
        <p className="mb-2 text-xs text-neutral-600">
          Describe the challenge in detail. This will be shown to candidates before they start. Supports markdown.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 font-mono text-sm text-white placeholder-neutral-600 transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder={"## Objective\nBuild a...\n\n## Requirements\n- ...\n- ...\n\n## Evaluation Criteria\n- How you break down the problem\n- How you collaborate with the AI assistant"}
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-400">Time Limit (minutes)</label>
        <input
          type="number"
          value={timeLimit}
          onChange={(e) => setTimeLimit(Math.max(10, Math.min(45, parseInt(e.target.value) || 30)))}
          min={10}
          max={45}
          className="w-32 rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-400">
          Session Limit <span className="text-neutral-600">(optional - leave blank for plan limit)</span>
        </label>
        <p className="mb-2 text-xs text-neutral-600">
          Maximum number of candidates who can create or receive sessions for this challenge.
          {' '}
          {availableAssessmentCount === null
            ? 'Available: unlimited.'
            : availableAssessmentCount === undefined
              ? 'Checking availability...'
              : `Available: ${availableAssessmentCount} assessment${availableAssessmentCount !== 1 ? 's' : ''}.`}
        </p>
        <input
          type="number"
          value={sessionsLimit}
          onChange={(e) => handleSessionsLimitChange(e.target.value)}
          min={0}
          max={typeof availableAssessmentCount === 'number' ? availableAssessmentCount : undefined}
          placeholder="Plan limit"
          className="w-36 rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white placeholder-neutral-600 transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-400">
          Assessment Window <span className="text-neutral-600">(optional)</span>
        </label>
        <p className="mb-2 text-xs text-neutral-600">
          Candidates can enter or start only during this window. Active sessions still use the challenge timer.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-neutral-500">Starts</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-neutral-500">Ends</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-400">
          Candidate Email Allowlist <span className="text-neutral-600">(optional)</span>
        </label>
        <p className="mb-2 text-xs text-neutral-600">
          {allowedEmails.length === 0
            ? 'Anyone with the shareable link can register. Personalized invites are added here automatically.'
            : `Only the ${allowedEmails.length} listed email${allowedEmails.length !== 1 ? 's' : ''} can register through the shareable link.`}
        </p>
        <div
          className="flex min-h-12 cursor-text flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2"
          onClick={(e) => {
            const input = (e.currentTarget as HTMLElement).querySelector('input');
            input?.focus();
          }}
        >
          {allowedEmails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {email}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAllowedEmails((prev) => prev.filter((em) => em !== email));
                }}
                className="cursor-pointer leading-none text-primary/60 hover:text-primary"
                aria-label={`Remove ${email}`}
              >
                &times;
              </button>
            </span>
          ))}
          <input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            onKeyDown={handleEmailKeyDown}
            onPaste={handleEmailPaste}
            onBlur={commitEmailDraft}
            placeholder={allowedEmails.length === 0 ? 'Type an email and press Enter or comma...' : ''}
            className="min-w-55 flex-1 bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-400">
          Starter Files <span className="text-neutral-600">(optional)</span>
        </label>
        <p className="mb-2 text-xs text-neutral-600">
          Files to pre-populate the candidate&apos;s workspace. Generate them with AI or add manually.
        </p>
        <StarterFilesEditor
          files={starterFiles}
          onChange={setStarterFiles}
          challengeTitle={title}
          challengeDescription={description}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-glow rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-all hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Challenge'}
      </button>
    </form>
  );
}
