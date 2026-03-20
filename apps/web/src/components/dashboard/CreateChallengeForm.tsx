'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StarterFilesEditor from './StarterFilesEditor';
import { useAuth } from '@/context/AuthContext';
import type { StarterFile } from '@/types';

export default function CreateChallengeForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);
  const [sessionsLimit, setSessionsLimit] = useState<string>('');
  const [starterFiles, setStarterFiles] = useState<StarterFile[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const prefill = sessionStorage.getItem('prefill_challenge');
    if (prefill) {
      try {
        const data = JSON.parse(prefill);
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
        if (data.timeLimit) setTimeLimit(Math.max(10, Math.min(45, data.timeLimit)));
        if (data.starterFiles) setStarterFiles(data.starterFiles);
        if (Array.isArray(data.allowedEmails)) setAllowedEmails(data.allowedEmails);
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
          sessions_limit: user?.isAdmin && sessionsLimit !== '' ? parseInt(sessionsLimit) : undefined,
          allowed_emails: allowedEmails.length > 0 ? allowedEmails : undefined,
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
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">Challenge Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all"
          placeholder="e.g., Build a REST API with Claude"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">Description</label>
        <p className="text-xs text-neutral-600 mb-2">
          Describe the challenge in detail. This will be shown to candidates before they start. Supports markdown.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 font-mono text-sm transition-all"
          placeholder={"## Objective\nBuild a...\n\n## Requirements\n- ...\n- ...\n\n## Evaluation Criteria\n- How you break down the problem\n- How you collaborate with the AI assistant"}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">Time Limit (minutes)</label>
        <input
          type="number"
          value={timeLimit}
          onChange={(e) => setTimeLimit(Math.max(10, Math.min(45, parseInt(e.target.value) || 30)))}
          min={10}
          max={45}
          className="w-32 bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all"
        />
      </div>

      {user?.isAdmin && (
        <div>
          <label className="block text-sm font-medium text-neutral-400 mb-2">
            Session Limit <span className="text-neutral-600">(optional — leave blank for unlimited)</span>
          </label>
          <p className="text-xs text-neutral-600 mb-2">
            Maximum number of candidates who can take this challenge.
          </p>
          <input
            type="number"
            value={sessionsLimit}
            onChange={(e) => setSessionsLimit(e.target.value)}
            min={1}
            placeholder="Unlimited"
            className="w-32 bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-1">
          Participant Restrictions <span className="text-neutral-600">(optional)</span>
        </label>
        <p className="text-xs text-neutral-600 mb-2">
          {allowedEmails.length === 0
            ? 'Anyone with the link can attempt this assessment. Add emails to restrict access.'
            : `Only the ${allowedEmails.length} listed email${allowedEmails.length !== 1 ? 's' : ''} can attempt this assessment.`}
        </p>
        <div
          className="bg-[#0a0a0a] px-3 py-2 min-h-12 flex flex-wrap gap-2 items-center cursor-text"
          style={{ border: '2px solid #c0c0c0', borderRadius: '10px' }}
          onClick={(e) => {
            const input = (e.currentTarget as HTMLElement).querySelector('input');
            input?.focus();
          }}
        >
          {allowedEmails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full"
            >
              {email}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAllowedEmails((prev) => prev.filter((em) => em !== email));
                }}
                className="text-primary/60 hover:text-primary leading-none cursor-pointer"
                aria-label={`Remove ${email}`}
              >
                ×
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
            placeholder={allowedEmails.length === 0 ? 'Type an email and press Enter or comma…' : ''}
            className="flex-1 min-w-55 bg-transparent text-white text-sm placeholder:text-neutral-600 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">
          Starter Files <span className="text-neutral-600">(optional)</span>
        </label>
        <p className="text-xs text-neutral-600 mb-2">
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
        className="bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold px-6 py-3 rounded-xl transition-all btn-glow"
      >
        {loading ? 'Creating...' : 'Create Challenge'}
      </button>
    </form>
  );
}
