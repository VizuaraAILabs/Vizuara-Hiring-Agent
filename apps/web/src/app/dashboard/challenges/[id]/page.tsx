'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, FolderCode, Link2, Users } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import MarkdownViewer from '@/components/MarkdownViewer';
import ConfirmationModal from '@/components/ConfirmationModal';
import StarterFilesEditor from '@/components/dashboard/StarterFilesEditor';
import type { Challenge, Session, StarterFile } from '@/types';

interface ChallengeDetail extends Challenge {
  sessions: Session[];
}

type ChallengeTab = 'description' | 'starter-files' | 'distribution' | 'candidates';

function parseStarterFiles(raw: unknown): StarterFile[] {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(parsed)
    ? parsed.filter((file): file is StarterFile => Boolean(file?.path))
    : [];
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const challengeId = params.id as string;
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChallengeTab>('description');
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [analysisStartingIds, setAnalysisStartingIds] = useState<Set<string>>(new Set());
  const [copiedShareable, setCopiedShareable] = useState(false);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [allowedEmailsSaving, setAllowedEmailsSaving] = useState(false);
  const [allowedEmailsSaved, setAllowedEmailsSaved] = useState(false);
  const [starterFiles, setStarterFiles] = useState<StarterFile[]>([]);
  const [savedStarterFiles, setSavedStarterFiles] = useState<StarterFile[]>([]);
  const [starterFilesSaving, setStarterFilesSaving] = useState(false);
  const [starterFilesSaved, setStarterFilesSaved] = useState(false);
  const [starterFilesError, setStarterFilesError] = useState('');
  const [modalMessage, setModalMessage] = useState<{ title: string; description: string } | null>(null);

  const fetchChallengeDetail = useCallback(async (): Promise<ChallengeDetail> => {
    const res = await fetch(`/api/challenges/${challengeId}`);
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !Array.isArray(data.sessions)) {
      throw new Error(data?.error || 'Failed to load challenge');
    }

    return data;
  }, [challengeId]);

  useEffect(() => {
    fetchChallengeDetail()
      .then((data) => {
        const files = parseStarterFiles(data.starter_files);
        setChallenge(data);
        setAllowedEmails(data.allowed_emails ?? []);
        setStarterFiles(files);
        setSavedStarterFiles(files);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchChallengeDetail]);

  const hasPendingAnalysisSession = challenge?.sessions.some(
    (session) => session.status === 'queued' || session.status === 'analyzing'
  ) ?? false;

  useEffect(() => {
    if (!hasPendingAnalysisSession) return;

    let cancelled = false;
    let timeout: number;

    async function poll() {
      try {
        const data = await fetchChallengeDetail();
        if (!cancelled) setChallenge(data);
      } catch (error) {
        console.error(error);
      }

      if (!cancelled) timeout = window.setTimeout(poll, 5000);
    }

    timeout = window.setTimeout(poll, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [hasPendingAnalysisSession, fetchChallengeDetail]);

  const starterFileCount = starterFiles.filter((file) => file.path && !file.path.endsWith('/.gitkeep')).length;
  const hasStarterFileChanges = useMemo(
    () => JSON.stringify(starterFiles) !== JSON.stringify(savedStarterFiles),
    [starterFiles, savedStarterFiles]
  );
  const assessmentUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${challengeId}` : `/apply/${challengeId}`;

  const tabs = [
    { id: 'description' as const, label: 'Description', icon: FileText },
    { id: 'starter-files' as const, label: 'Starter Files', icon: FolderCode, badge: starterFileCount },
    { id: 'distribution' as const, label: 'Invitations', icon: Link2 },
    { id: 'candidates' as const, label: 'Candidates', icon: Users, badge: challenge?.sessions.length ?? 0 },
  ];

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400',
    active: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-neutral-800 text-neutral-400',
    queued: 'bg-amber-500/10 text-amber-300',
    analyzing: 'bg-violet-500/10 text-violet-300',
    analyzed: 'bg-primary/10 text-primary',
    'analysis failed': 'bg-red-500/10 text-red-300',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    active: 'Active',
    completed: 'Completed',
    queued: 'Queued',
    analyzing: 'Analyzing',
    analyzed: 'Analyzed',
    'analysis failed': 'Analysis failed',
  };

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
    const newEmails = e.clipboardData.getData('text')
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
    const draft = emailDraft.trim().toLowerCase();
    const finalList = draft && !allowedEmails.includes(draft) ? [...allowedEmails, draft] : allowedEmails;
    if (draft) {
      setAllowedEmails(finalList);
      setEmailDraft('');
    }

    setAllowedEmailsSaving(true);
    setAllowedEmailsSaved(false);
    try {
      await fetch(`/api/challenges/${challengeId}/allowed-emails`, {
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

  async function handleSaveStarterFiles() {
    setStarterFilesSaving(true);
    setStarterFilesSaved(false);
    setStarterFilesError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starter_files: starterFiles }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save starter files' }));
        throw new Error(data.error || 'Failed to save starter files');
      }

      setSavedStarterFiles([...starterFiles]);
      setChallenge((current) => current ? { ...current, starter_files: starterFiles } : current);
      setStarterFilesSaved(true);
      setTimeout(() => setStarterFilesSaved(false), 2500);
    } catch (err: unknown) {
      setStarterFilesError(err instanceof Error ? err.message : 'Failed to save starter files');
    } finally {
      setStarterFilesSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);

    try {
      const res = await fetch(`/api/challenges/${challengeId}/invite`, {
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
        setChallenge(await fetchChallengeDetail());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  }

  function updateSessionStatus(sessionId: string, status: Session['status']) {
    setChallenge((current) => current
      ? {
          ...current,
          sessions: current.sessions.map((session) => (
            session.id === sessionId ? { ...session, status } : session
          )),
        }
      : current
    );
  }

  async function handleAnalyze(sessionId: string) {
    setAnalysisStartingIds((current) => new Set(current).add(sessionId));
    try {
      const res = await fetch(`/api/analysis/${sessionId}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
        updateSessionStatus(sessionId, 'completed');
        setModalMessage({
          title: 'Analysis Failed',
          description: err.error || 'Analysis failed. Check console for details.',
        });
        return;
      }
      updateSessionStatus(sessionId, 'queued');
    } catch (err) {
      console.error('Analysis error:', err);
      updateSessionStatus(sessionId, 'completed');
      setModalMessage({
        title: 'Analysis Unavailable',
        description: 'Failed to connect to analysis engine.',
      });
    } finally {
      setAnalysisStartingIds((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  }

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
      <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-white/10 bg-[#0a0a0a]/95 px-6 pt-6 backdrop-blur supports-[backdrop-filter]:bg-[#0a0a0a]/85">
        <div className="mb-8">
          <h1 className="text-2xl font-serif italic text-white">{challenge.title}</h1>
          <p className="mt-1 text-neutral-500">{challenge.time_limit_min} minute time limit</p>
        </div>

        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{tab.label}</span>
                  {typeof tab.badge === 'number' && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${isActive ? 'bg-primary/15 text-primary' : 'bg-white/5 text-neutral-500'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === 'description' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          {challenge.description ? <MarkdownViewer content={challenge.description} /> : <p className="text-neutral-600">No description configured.</p>}
        </div>
      )}

      {activeTab === 'starter-files' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Starter Files</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {starterFileCount > 0 ? `${starterFileCount} file${starterFileCount !== 1 ? 's' : ''} configured` : 'No starter files configured'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {hasStarterFileChanges && <span className="text-xs text-amber-300">Unsaved changes</span>}
              {starterFilesSaved && <span className="text-xs text-primary">Saved!</span>}
              {starterFilesError && <span className="text-xs text-red-400">{starterFilesError}</span>}
              <Link
                href={`/dashboard/challenges/${challenge.id}/starter-files`}
                className="rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-white/10"
              >
                Full Screen
              </Link>
              <button
                type="button"
                onClick={handleSaveStarterFiles}
                disabled={starterFilesSaving || !hasStarterFileChanges}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-primary-light disabled:opacity-50"
              >
                {starterFilesSaving ? 'Saving...' : 'Save Files'}
              </button>
            </div>
          </div>
          <div className="h-[560px] min-h-0 rounded-2xl bg-surface">
            <StarterFilesEditor
              files={starterFiles}
              onChange={setStarterFiles}
              challengeTitle={challenge.title}
              challengeDescription={challenge.description}
              mode="full"
            />
          </div>
        </div>
      )}

      {activeTab === 'distribution' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-primary/20 bg-surface p-5">
              <div className="mb-4">
                <p className="text-sm font-medium text-white">Shareable Assessment Link</p>
                <p className="mt-1 text-xs text-neutral-500">Share this single link with all candidates. They enter their own details before starting.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={assessmentUrl}
                  readOnly
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2 text-xs font-mono text-primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(assessmentUrl);
                    setCopiedShareable(true);
                    setTimeout(() => setCopiedShareable(false), 2000);
                  }}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-primary-light"
                >
                  {copiedShareable ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-surface p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Participant Restrictions</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {allowedEmails.length === 0
                      ? 'Anyone with the link can attempt this assessment. Add emails to restrict access.'
                      : `Only the ${allowedEmails.length} listed email${allowedEmails.length !== 1 ? 's' : ''} can attempt this assessment.`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {allowedEmailsSaved && <span className="text-xs text-primary">Saved!</span>}
                  {allowedEmails.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAllowedEmails([]);
                        setEmailDraft('');
                        setAllowedEmailsSaved(false);
                      }}
                      disabled={allowedEmailsSaving}
                      className="rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-300 transition-all hover:bg-white/10 disabled:opacity-50"
                    >
                      Clear All
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveAllowedEmails}
                    disabled={allowedEmailsSaving}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-primary-light disabled:opacity-50"
                  >
                    {allowedEmailsSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div
                className="flex min-h-12 cursor-text flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2"
                onClick={(e) => {
                  const input = (e.currentTarget as HTMLElement).querySelector('input');
                  input?.focus();
                }}
              >
                {allowedEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {email}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAllowedEmails((prev) => prev.filter((em) => em !== email));
                      }}
                      className="text-primary/60 hover:text-primary"
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
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-white">Invite Candidate</h2>
            <form onSubmit={handleInvite} className="space-y-4 rounded-2xl border border-white/5 bg-surface p-6">
              <div>
                <label className="mb-1 block text-sm text-neutral-500">Name</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-500">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={inviteLoading}
                className="btn-glow w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-black transition-all hover:bg-primary-light disabled:opacity-50"
              >
                {inviteLoading ? 'Sending...' : 'Generate Invite Link'}
              </button>
            </form>

            {inviteLink && (
              <div className="glow-green mt-4 rounded-2xl border border-primary/20 bg-surface p-4">
                <p className="mb-2 text-xs text-neutral-500">Share this link with the candidate:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteLink}
                    readOnly
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2 text-xs font-mono text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    className="rounded-xl bg-white/5 px-3 py-2 text-xs text-neutral-400 transition-colors hover:bg-white/10"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'candidates' && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Candidates ({challenge.sessions.length})</h2>
          {challenge.sessions.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-surface p-8 text-center">
              <p className="text-neutral-600">No candidates invited yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/5 bg-surface">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs uppercase tracking-[0.18em] text-neutral-600">
                    <th className="px-5 py-3 font-medium">Candidate</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Started</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {challenge.sessions.map((session) => {
                    const isStartingAnalysis = analysisStartingIds.has(session.id);
                    const visibleStatus = isStartingAnalysis ? 'queued' : session.status;

                    return (
                      <tr key={session.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-5 py-4 font-medium text-white">{session.candidate_name}</td>
                        <td className="px-5 py-4 text-neutral-500">{session.candidate_email}</td>
                        <td className="px-5 py-4 text-neutral-600">{session.started_at ? formatDateTime(session.started_at) : 'Not started'}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColors[visibleStatus]}`}>
                            {statusLabels[visibleStatus] ?? visibleStatus}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            {visibleStatus === 'analyzed' && (
                              <Link href={`/dashboard/challenges/${challenge.id}/submissions/${session.id}`} className="text-sm font-medium text-primary transition-colors hover:text-primary-light">
                                View Report
                              </Link>
                            )}
                            {visibleStatus === 'queued' && (
                              <span className="flex items-center gap-2 text-sm font-medium text-amber-300">
                                {isStartingAnalysis && (
                                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                )}
                                Queued
                              </span>
                            )}
                            {visibleStatus === 'analyzing' && (
                              <span className="flex items-center gap-2 text-sm font-medium text-violet-300">
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Analyzing...
                              </span>
                            )}
                            {visibleStatus === 'analysis failed' && (
                              <button
                                type="button"
                                disabled={isStartingAnalysis}
                                onClick={() => handleAnalyze(session.id)}
                                title="The analysis could not finish. Candidate data is saved."
                                className="flex items-center gap-2 text-sm font-medium text-red-300 hover:text-red-200 disabled:text-red-500"
                              >
                                Retry analysis
                              </button>
                            )}
                            {visibleStatus === 'completed' && (
                              <button
                                type="button"
                                disabled={isStartingAnalysis}
                                onClick={() => handleAnalyze(session.id)}
                                className="flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300 disabled:text-violet-600"
                              >
                                Analyze
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        open={Boolean(modalMessage)}
        title={modalMessage?.title ?? ''}
        description={modalMessage?.description ?? ''}
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setModalMessage(null)}
        onClose={() => setModalMessage(null)}
      />
    </div>
  );
}
