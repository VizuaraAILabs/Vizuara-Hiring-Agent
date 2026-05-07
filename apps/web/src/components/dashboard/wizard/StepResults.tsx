'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { GeneratedChallenge } from './types';

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-500/10 text-green-400 border-green-500/20',
  intermediate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  advanced: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  expert: 'bg-red-500/10 text-red-400 border-red-500/20',
};

interface StepResultsProps {
  challenges: GeneratedChallenge[];
  timeLimitMin: number;
  role?: string | null;
  techStack?: string[];
  seniority?: string | null;
  focusAreas?: string[];
  context?: string | null;
  onRegenerate: () => void;
  onBack: () => void;
}

export default function StepResults({ challenges, timeLimitMin, role, techStack, seniority, focusAreas, context, onRegenerate, onBack }: StepResultsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedWhy, setExpandedWhy] = useState<number | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [customizingIndex, setCustomizingIndex] = useState<number | null>(null);
  const [sessionsLimits, setSessionsLimits] = useState<Record<number, string>>({});
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [fileWarning, setFileWarning] = useState('');
  const [progressMessage, setProgressMessage] = useState('');

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

  async function handleUseChallenge(challenge: GeneratedChallenge, index: number) {
    setCreatingIndex(index);
    setError('');
    setFileWarning('');

    try {
      // Auto-generate starter files (non-fatal if it fails)
      let starterFiles;
      try {
        setProgressMessage('Generating starter files...');
        const genRes = await fetch('/api/challenges/generate-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: challenge.title, description: challenge.description }),
        });
        if (genRes.ok) {
          const genData = await genRes.json();
          if (genData.files?.length > 0) starterFiles = genData.files;
        }
        if (!starterFiles) {
          setFileWarning('Starter files could not be generated — you can add them manually in the editor.');
        }
      } catch {
        setFileWarning('Starter files could not be generated — you can add them manually in the editor.');
      }

      setProgressMessage('Creating challenge...');
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: challenge.title,
          description: challenge.description,
          time_limit_min: timeLimitMin,
          starter_files: starterFiles,
          sessions_limit: user?.isAdmin && sessionsLimits[index] ? parseInt(sessionsLimits[index]) : undefined,
          allowed_emails: allowedEmails.length > 0 ? allowedEmails : undefined,
          role: role || undefined,
          tech_stack: techStack && techStack.length > 0 ? techStack.join(', ') : undefined,
          seniority: seniority || undefined,
          focus_areas: focusAreas && focusAreas.length > 0 ? focusAreas : undefined,
          context: context || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create challenge');
        return;
      }

      const created = await res.json();
      router.push(`/dashboard/challenges/${created.id}/starter-files`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setCreatingIndex(null);
      setProgressMessage('');
    }
  }

  async function handleCustomize(challenge: GeneratedChallenge, index: number) {
    setCustomizingIndex(index);
    setError('');

    let starterFiles;
    try {
      setProgressMessage('Generating starter files...');
      const genRes = await fetch('/api/challenges/generate-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: challenge.title, description: challenge.description }),
      });
      if (genRes.ok) {
        const genData = await genRes.json();
        if (genData.files?.length > 0) starterFiles = genData.files;
      }
    } catch {
      // Non-fatal — editor will start empty
    } finally {
      setProgressMessage('');
    }

    sessionStorage.setItem(
      'prefill_challenge',
      JSON.stringify({
        title: challenge.title,
        description: challenge.description,
        timeLimit: timeLimitMin,
        starterFiles,
        allowedEmails: allowedEmails.length > 0 ? allowedEmails : undefined,
      })
    );
    setCustomizingIndex(null);
    router.push(`/dashboard/challenges/new?tab=manual&prefill=true&t=${Date.now()}`);
  }

  function getDescriptionPreview(description: string) {
    const lines = description.split('\n').filter((l) => l.trim());
    return lines.slice(0, 4).join('\n');
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">Generated Challenges</h2>
        <p className="text-neutral-500">
          {challenges.length} challenges tailored to your requirements. Use one directly or customize it first.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {fileWarning && !error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-yellow-400 text-sm mb-6">
          {fileWarning}
        </div>
      )}

      {/* Participant Restrictions */}
      <div className="bg-surface border border-white/10 rounded-xl p-5 mb-6">
        <p className="text-sm font-medium text-white mb-1">Participant Restrictions</p>
        <p className="text-xs text-neutral-500 mb-3">
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

      <div className="space-y-4 mb-8">
        {challenges.map((challenge, i) => {
          const isExpanded = expandedIndex === i;
          const isWhyExpanded = expandedWhy === i;
          const colorClass = difficultyColors[challenge.difficulty] || difficultyColors.intermediate;

          return (
            <div
              key={i}
              className="bg-surface border border-white/10 rounded-xl p-6 hover:border-white/15 transition-all"
            >
              {/* Header */}
              <div className="flex flex-wrap items-start gap-3 mb-3">
                <h3 className="text-lg font-semibold text-white flex-1">{challenge.title}</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
                  {challenge.difficulty}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-neutral-400 border border-white/10">
                  {challenge.duration_minutes} min
                </span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {challenge.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-white/5 text-neutral-500 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Description */}
              <div className="mb-4">
                <pre className="text-neutral-400 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {isExpanded ? challenge.description : getDescriptionPreview(challenge.description)}
                </pre>
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  className="text-primary text-sm mt-2 hover:underline"
                >
                  {isExpanded ? 'Show less' : 'Show full description'}
                </button>
              </div>

              {/* Why iterative */}
              {challenge.why_iterative && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setExpandedWhy(isWhyExpanded ? null : i)}
                    className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1"
                  >
                    <span className={`inline-block transition-transform ${isWhyExpanded ? 'rotate-90' : ''}`}>
                      &#9656;
                    </span>
                    Why this tests AI collaboration
                  </button>
                  {isWhyExpanded && (
                    <p className="text-sm text-neutral-500 mt-2 pl-4 border-l border-white/10">
                      {challenge.why_iterative}
                    </p>
                  )}
                </div>
              )}

              {/* Admin session limit */}
              {user?.isAdmin && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">
                    Session limit <span className="text-neutral-600">(leave blank for unlimited)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={sessionsLimits[i] ?? ''}
                    onChange={(e) => setSessionsLimits((prev) => ({ ...prev, [i]: e.target.value }))}
                    className="w-28 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2 border-t border-white/5">
                <button
                  onClick={() => handleUseChallenge(challenge, i)}
                  disabled={creatingIndex !== null || customizingIndex !== null}
                  className="bg-primary hover:bg-primary-light disabled:opacity-50 text-black font-semibold px-5 py-2.5 rounded-lg text-sm transition-all"
                >
                  {creatingIndex === i ? 'Creating...' : 'Use This Challenge'}
                </button>
                <button
                  onClick={() => handleCustomize(challenge, i)}
                  disabled={creatingIndex !== null || customizingIndex !== null}
                  className="px-5 py-2.5 border border-white/10 text-neutral-400 rounded-lg text-sm hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
                >
                  {customizingIndex === i ? 'Preparing...' : 'Customize First'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={onRegenerate}
          className="px-5 py-3 bg-surface border border-white/10 text-neutral-400 rounded-xl hover:text-white hover:border-white/20 transition-all"
        >
          Regenerate
        </button>
        <button
          onClick={onBack}
          className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
        >
          Back to Settings
        </button>
      </div>

      {/* Progress modal */}
      {progressMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface border border-white/10 rounded-2xl px-8 py-6 flex flex-col items-center gap-4 shadow-2xl">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-neutral-300">{progressMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
