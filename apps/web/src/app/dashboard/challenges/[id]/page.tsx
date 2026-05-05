'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import MarkdownViewer from '@/components/MarkdownViewer';
import type { Challenge, Session } from '@/types';

interface ChallengeDetail extends Challenge {
  sessions: Session[];
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [copiedShareable, setCopiedShareable] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [allowedEmailsSaving, setAllowedEmailsSaving] = useState(false);
  const [allowedEmailsSaved, setAllowedEmailsSaved] = useState(false);

  const fetchChallengeDetail = useCallback(async (): Promise<ChallengeDetail> => {
    const res = await fetch(`/api/challenges/${params.id}`);
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !Array.isArray(data.sessions)) {
      throw new Error(data?.error || 'Failed to load challenge');
    }

    return data;
  }, [params.id]);

  useEffect(() => {
    fetchChallengeDetail()
      .then((data) => {
        setChallenge(data);
        setAllowedEmails(data.allowed_emails ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchChallengeDetail]);

  const hasAnalyzingSession = challenge?.sessions.some((session) => session.status === 'analyzing') ?? false;

  useEffect(() => {
    if (!hasAnalyzingSession) return;

    let cancelled = false;
    let timeout: number;

    async function poll() {
      try {
        const data = await fetchChallengeDetail();
        if (!cancelled) setChallenge(data);
      } catch (error) {
        console.error(error);
      }

      if (!cancelled) {
        timeout = window.setTimeout(poll, 5000);
      }
    }

    timeout = window.setTimeout(poll, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [hasAnalyzingSession, fetchChallengeDetail]);

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

  async function handleSaveAllowedEmails() {
    // Commit any pending draft before saving
    const draft = emailDraft.trim().toLowerCase();
    const finalList = draft && !allowedEmails.includes(draft)
      ? [...allowedEmails, draft]
      : allowedEmails;
    if (draft) {
      setAllowedEmails(finalList);
      setEmailDraft('');
    }

    setAllowedEmailsSaving(true);
    setAllowedEmailsSaved(false);
    try {
      await fetch(`/api/challenges/${params.id}/allowed-emails`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_emails: finalList.join(', ') }),
      });
      setAllowedEmailsSaved(true);
      setTimeout(() => setAllowedEmailsSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setAllowedEmailsSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);

    try {
      const res = await fetch(`/api/challenges/${params.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: inviteForm.name,
          candidate_email: inviteForm.email,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setInviteLink(`${window.location.origin}${data.invite_url}`);
        setInviteForm({ name: '', email: '' });
        const refreshed = await fetchChallengeDetail();
        setChallenge(refreshed);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400',
    active: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-neutral-800 text-neutral-400',
    analyzing: 'bg-violet-500/10 text-violet-300',
    analyzed: 'bg-[#00a854]/10 text-[#00a854]',
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  if (!challenge) return <p className="text-neutral-500">Challenge not found</p>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-serif italic text-white">{challenge.title}</h1>
        <p className="text-neutral-500 mt-1">{challenge.time_limit_min} minute time limit</p>
      </div>

      {/* Description Accordion */}
      {challenge.description && (
        <div className="bg-[#111] border border-white/5 rounded-2xl mb-8 overflow-hidden">
          <button
            onClick={() => setDescriptionOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/2 transition-colors"
          >
            <span className="text-sm font-medium text-white">Description</span>
            <svg
              className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${descriptionOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6,8 10,12 14,8" />
            </svg>
          </button>
          {descriptionOpen && (
            <div className="px-5 pb-5 border-t border-white/5 pt-4">
              <MarkdownViewer content={challenge.description} />
            </div>
          )}
        </div>
      )}

      {/* Shareable Link */}
      <div className="bg-[#111] border border-[#00a854]/20 rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white mb-1">Shareable Assessment Link</p>
            <p className="text-xs text-neutral-500">Share this single link with all candidates. They enter their own details before starting.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={typeof window !== 'undefined' ? `${window.location.origin}/apply/${params.id}` : `/apply/${params.id}`}
              readOnly
              className="bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2 text-[#00a854] text-xs font-mono w-64"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/apply/${params.id}`);
                setCopiedShareable(true);
                setTimeout(() => setCopiedShareable(false), 2000);
              }}
              className="bg-[#00a854] hover:bg-[#00c96b] text-black px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
            >
              {copiedShareable ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Starter Files */}
      <div className="bg-[#111] border border-white/5 rounded-2xl p-5 mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Starter Files</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {challenge.starter_files && challenge.starter_files.length > 0
              ? `${challenge.starter_files.length} file${challenge.starter_files.length !== 1 ? 's' : ''} configured`
              : 'No starter files configured'}
          </p>
        </div>
        <Link
          href={`/dashboard/challenges/${challenge.id}/starter-files`}
          className="text-primary hover:text-primary-light text-sm font-medium transition-colors"
        >
          {challenge.starter_files && challenge.starter_files.length > 0 ? 'Edit Starter Files' : 'Add Starter Files'}
        </Link>
      </div>

      {/* Participant Restrictions */}
      <div className="bg-[#111] border border-white/5 rounded-2xl p-5 mb-8">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-medium text-white">Participant Restrictions</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {allowedEmails.length === 0
                ? 'Anyone with the link can attempt this assessment. Add emails to restrict access.'
                : `Only the ${allowedEmails.length} listed email${allowedEmails.length !== 1 ? 's' : ''} can attempt this assessment.`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {allowedEmailsSaved && (
              <span className="text-xs text-primary">Saved!</span>
            )}
            {allowedEmails.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAllowedEmails([]);
                  setEmailDraft('');
                  setAllowedEmailsSaved(false);
                }}
                disabled={allowedEmailsSaving}
                className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-neutral-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer"
              >
                Clear All
              </button>
            )}
            <button
              onClick={handleSaveAllowedEmails}
              disabled={allowedEmailsSaving}
              className="bg-primary hover:bg-primary-light disabled:opacity-50 text-black px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer"
            >
              {allowedEmailsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Chip input area */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Candidates List */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4">
            Candidates ({challenge.sessions.length})
          </h2>

          {challenge.sessions.length === 0 ? (
            <div className="bg-[#111] border border-white/5 rounded-2xl p-8 text-center">
              <p className="text-neutral-600">No candidates invited yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {challenge.sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-[#111] border border-white/5 rounded-2xl p-5 flex items-center justify-between hover:border-white/10 transition-colors"
                >
                  <div>
                    <p className="text-white font-medium">{session.candidate_name}</p>
                    <p className="text-neutral-600 text-sm">{session.candidate_email}</p>
                    {session.started_at && (
                      <p className="text-neutral-700 text-xs mt-1">
                        Started {formatDateTime(session.started_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[session.status]}`}>
                      {session.status}
                    </span>
                    {session.status === 'analyzed' && (
                      <Link
                        href={`/dashboard/challenges/${challenge.id}/submissions/${session.id}`}
                        className="text-[#00a854] hover:text-[#00c96b] text-sm font-medium transition-colors"
                      >
                        View Report
                      </Link>
                    )}
                    {session.status === 'analyzing' && (
                      <span className="text-violet-300 text-sm font-medium flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Analyzing...
                      </span>
                    )}
                    {session.status === 'completed' && (
                      <button
                        disabled={analyzingId === session.id}
                        onClick={async () => {
                          setAnalyzingId(session.id);
                          try {
                            const res = await fetch(`/api/analysis/${session.id}`, { method: 'POST' });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
                              alert(err.error || 'Analysis failed. Check console for details.');
                              return;
                            }
                            const refreshed = await fetchChallengeDetail();
                            setChallenge(refreshed);
                          } catch (err) {
                            console.error('Analysis error:', err);
                            alert('Failed to connect to analysis engine.');
                          } finally {
                            setAnalyzingId(null);
                          }
                        }}
                        className="text-violet-400 hover:text-violet-300 disabled:text-violet-600 text-sm font-medium flex items-center gap-2"
                      >
                        {analyzingId === session.id ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Analyzing...
                          </>
                        ) : (
                          'Analyze'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite Form */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Invite Candidate</h2>
          <form
            onSubmit={handleInvite}
            className="bg-[#111] border border-white/5 rounded-2xl p-6 space-y-4"
          >
            <div>
              <label className="block text-sm text-neutral-500 mb-1">Name</label>
              <input
                type="text"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-500 mb-1">Email</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={inviteLoading}
              className="w-full bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-50 text-black py-2.5 rounded-xl text-sm font-semibold transition-all btn-glow"
            >
              {inviteLoading ? 'Sending...' : 'Generate Invite Link'}
            </button>
          </form>

          {inviteLink && (
            <div className="mt-4 bg-[#111] border border-[#00a854]/20 rounded-2xl p-4 glow-green">
              <p className="text-xs text-neutral-500 mb-2">Share this link with the candidate:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2 text-[#00a854] text-xs font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="bg-white/5 hover:bg-white/10 text-neutral-400 px-3 py-2 rounded-xl text-xs transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
