'use client';

import ArcSpinner from '@/components/ArcSpinner';
import { useAuth } from '@/context/AuthContext';
import type { CandidateLifecycleStatus, DecisionLabel, Session } from '@/types';
import { Download, FileText, ListFilter, SlidersHorizontal, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type AssessmentChallenge = {
  id: string;
  title: string;
  candidate_count: number;
};

type AssessmentCandidate = Pick<
  Session,
  | 'id'
  | 'challenge_id'
  | 'candidate_name'
  | 'candidate_email'
  | 'status'
  | 'started_at'
  | 'ended_at'
  | 'created_at'
  | 'decision_label'
  | 'recruiter_notes'
  | 'invite_email_status'
  | 'invite_email_sent_at'
  | 'invite_email_error'
  | 'candidate_lifecycle_status'
> & {
  challenge_title: string;
};

type CandidateColumnId =
  | 'candidate'
  | 'assessment'
  | 'email'
  | 'started'
  | 'duration'
  | 'sessionStatus'
  | 'candidateStatus'
  | 'decision'
  | 'inviteEmail';

type CandidateColumn = {
  id: CandidateColumnId;
  label: string;
  description: string;
  locked?: boolean;
};

const candidateColumns: CandidateColumn[] = [
  { id: 'candidate', label: 'Candidate', description: 'Candidate name', locked: true },
  { id: 'assessment', label: 'Assessment', description: 'Challenge or assessment name' },
  { id: 'email', label: 'Email', description: 'Candidate email address' },
  { id: 'started', label: 'Started', description: 'Session start time' },
  { id: 'duration', label: 'Duration', description: 'Total time taken' },
  { id: 'sessionStatus', label: 'Session Status', description: 'Assessment progress state' },
  { id: 'candidateStatus', label: 'Candidate Status', description: 'Recruiter lifecycle state' },
  { id: 'decision', label: 'Decision', description: 'Recruiter decision and notes' },
  { id: 'inviteEmail', label: 'Invite Email', description: 'Invite delivery status' },
];

const defaultCandidateColumns = new Set<CandidateColumnId>([
  'candidate',
  'assessment',
  'duration',
  'sessionStatus',
  'candidateStatus',
  'decision',
]);

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

const lifecycleStatusColors: Record<CandidateLifecycleStatus, string> = {
  revoked: 'border-red-500/20 bg-red-500/10 text-red-300',
  no_show: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  withdrawn: 'border-neutral-500/20 bg-neutral-800 text-neutral-400',
  disqualified: 'border-red-500/20 bg-red-500/10 text-red-300',
};

const lifecycleStatusLabels: Record<CandidateLifecycleStatus, string> = {
  revoked: 'Revoked',
  no_show: 'No-show',
  withdrawn: 'Withdrawn',
  disqualified: 'Disqualified',
};

const inviteEmailStatusColors: Record<string, string> = {
  sending: 'bg-blue-500/10 text-blue-300',
  sent: 'bg-primary/10 text-primary',
  failed: 'bg-red-500/10 text-red-300',
  not_sent: 'bg-neutral-800 text-neutral-400',
};

const inviteEmailStatusLabels: Record<string, string> = {
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  not_sent: 'Not sent',
};

const decisionLabels: Record<DecisionLabel, string> = {
  shortlisted: 'Shortlisted',
  hold: 'Hold',
  reject: 'Reject',
  hired: 'Hired',
};

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getSessionDurationLabel(session: Pick<Session, 'started_at' | 'ended_at'>) {
  if (!session.started_at) return 'Not started';
  if (!session.ended_at) return 'In progress';

  const startedAt = new Date(session.started_at).getTime();
  const endedAt = new Date(session.ended_at).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return 'N/A';
  }

  return formatDurationMinutes(Math.ceil((endedAt - startedAt) / 60000));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDecisionColor(decision: DecisionLabel | null) {
  switch (decision) {
    case 'shortlisted':
      return 'border-primary/20 bg-primary/10 text-primary';
    case 'hired':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300';
    case 'hold':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    case 'reject':
      return 'border-red-500/20 bg-red-500/10 text-red-300';
    default:
      return 'border-white/10 bg-neutral-900 text-neutral-500';
  }
}

export default function AssessmentsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [challenges, setChallenges] = useState<AssessmentChallenge[]>([]);
  const [candidates, setCandidates] = useState<AssessmentCandidate[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [candidateColumnsOpen, setCandidateColumnsOpen] = useState(false);
  const [visibleCandidateColumns, setVisibleCandidateColumns] = useState<Set<CandidateColumnId>>(
    () => new Set(defaultCandidateColumns)
  );
  const [draftCandidateColumns, setDraftCandidateColumns] = useState<Set<CandidateColumnId>>(
    () => new Set(defaultCandidateColumns)
  );

  useEffect(() => {
    if (authLoading) return;
    if (user?.isAdmin && !user.companyId) {
      router.replace('/dashboard/admin');
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || !user?.companyId) return;

    let cancelled = false;

    fetch(`/api/assessments?challengeId=${encodeURIComponent(selectedChallengeId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !Array.isArray(data.candidates) || !Array.isArray(data.challenges)) {
          throw new Error(data?.error || 'Failed to load assessments');
        }
        if (!cancelled) {
          setCandidates(data.candidates);
          setChallenges(data.challenges);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load assessments');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, selectedChallengeId, user]);

  const selectedChallenge = challenges.find((challenge) => challenge.id === selectedChallengeId) ?? null;
  const selectedCandidate = selectedCandidateId
    ? candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null
    : null;

  const summary = useMemo(() => {
    const analyzed = candidates.filter((candidate) => candidate.status === 'analyzed').length;
    const eligible = candidates.filter((candidate) => !candidate.candidate_lifecycle_status).length;
    return { total: candidates.length, analyzed, eligible };
  }, [candidates]);

  function candidateColumnVisible(column: CandidateColumnId) {
    return visibleCandidateColumns.has(column);
  }

  function toggleDraftCandidateColumn(columnId: CandidateColumnId) {
    const column = candidateColumns.find((item) => item.id === columnId);
    if (column?.locked) return;

    setDraftCandidateColumns((current) => {
      const next = new Set(current);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }

  function applyCandidateColumns() {
    setVisibleCandidateColumns(new Set(draftCandidateColumns));
    setCandidateColumnsOpen(false);
  }

  function handleChallengeFilterChange(challengeId: string) {
    setSelectedChallengeId(challengeId);
    setSelectedCandidateId(null);
    setError('');
    setLoading(true);
  }

  const exportHref = `/api/assessments?challengeId=${encodeURIComponent(selectedChallengeId)}&format=csv`;
  const selectedActionButtonClass = 'inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary';

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-serif italic text-white">Assessments</h1>
          <p className="mt-1 text-neutral-500">Review candidate activity across every challenge.</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/5 bg-surface">
          <div className="border-r border-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-600">Candidates</p>
            <p className="mt-1 text-lg font-semibold text-white">{summary.total}</p>
          </div>
          <div className="border-r border-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-600">Analyzed</p>
            <p className="mt-1 text-lg font-semibold text-primary">{summary.analyzed}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-600">Eligible</p>
            <p className="mt-1 text-lg font-semibold text-white">{summary.eligible}</p>
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3">
          <ListFilter className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
          <span className="shrink-0 text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">Challenge</span>
          <select
            value={selectedChallengeId}
            onChange={(event) => handleChallengeFilterChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none"
          >
            <option value="all" className="bg-neutral-950">All challenges</option>
            {challenges.map((challenge) => (
              <option key={challenge.id} value={challenge.id} className="bg-neutral-950">
                {challenge.title} ({challenge.candidate_count})
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDraftCandidateColumns(new Set(visibleCandidateColumns));
              setCandidateColumnsOpen(true);
            }}
            className={selectedActionButtonClass}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Columns
          </button>
          <a href={exportHref} className={selectedActionButtonClass}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export scores CSV
          </a>
        </div>
      </div>

      <div className="mb-3">
        <h2 className="text-lg font-semibold text-white">
          Candidates ({summary.total})
          {selectedChallenge && <span className="text-neutral-500"> - {selectedChallenge.title}</span>}
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-500">
          Unstarted candidates marked revoked, no-show, withdrawn, or disqualified do not count against assessment usage capacity. Started sessions still count.
        </p>
        <p className="mt-1 text-sm text-primary">Click a candidate row to view actions.</p>
      </div>

      <div className="mb-5 rounded-xl border border-white/5 bg-surface px-4 py-3">
        {selectedCandidate ? (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{selectedCandidate.candidate_name}</p>
              <p className="truncate text-xs text-neutral-500">
                {selectedCandidate.candidate_email} - {selectedCandidate.challenge_title}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard/challenges/${selectedCandidate.challenge_id}?tab=candidates&candidateId=${selectedCandidate.id}`}
                className={selectedActionButtonClass}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Open assessment
              </Link>
              {selectedCandidate.status === 'analyzed' && (
                <Link
                  href={`/dashboard/challenges/${selectedCandidate.challenge_id}/submissions/${selectedCandidate.id}`}
                  className={selectedActionButtonClass}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  View Report
                </Link>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Select one candidate to show available actions.</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <ArcSpinner label="Loading assessments" sizeClassName="h-8 w-8" />
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-red-300">{error}</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-white">No candidates yet</p>
            <p className="mt-1 text-sm text-neutral-500">Candidate sessions will appear here once invites or applications are created.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-230 text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-[0.18em] text-neutral-600">
                  {candidateColumnVisible('candidate') && <th className="px-5 py-3 font-medium">Candidate</th>}
                  {candidateColumnVisible('assessment') && <th className="px-5 py-3 font-medium">Challenge</th>}
                  {candidateColumnVisible('email') && <th className="px-5 py-3 font-medium">Email</th>}
                  {candidateColumnVisible('started') && <th className="px-5 py-3 font-medium">Started</th>}
                  {candidateColumnVisible('duration') && <th className="px-5 py-3 font-medium">Duration</th>}
                  {candidateColumnVisible('sessionStatus') && <th className="px-5 py-3 font-medium">Session Status</th>}
                  {candidateColumnVisible('candidateStatus') && <th className="px-5 py-3 font-medium">Candidate Status</th>}
                  {candidateColumnVisible('decision') && <th className="px-5 py-3 font-medium">Decision</th>}
                  {candidateColumnVisible('inviteEmail') && <th className="px-5 py-3 font-medium">Invite Email</th>}
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => {
                  const isSelected = selectedCandidateId === candidate.id;
                  const visibleStatus = candidate.status;
                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => setSelectedCandidateId((current) => current === candidate.id ? null : candidate.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedCandidateId((current) => current === candidate.id ? null : candidate.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isSelected}
                      aria-label={`Select ${candidate.candidate_name}`}
                      className={`cursor-pointer border-b border-white/5 transition-colors last:border-0 ${isSelected ? 'bg-primary/8' : 'hover:bg-white/3'}`}
                    >
                      {candidateColumnVisible('candidate') && (
                        <td className="px-5 py-4 font-medium text-white">{candidate.candidate_name}</td>
                      )}
                      {candidateColumnVisible('assessment') && (
                        <td className="max-w-60 truncate px-5 py-4 text-neutral-400">{candidate.challenge_title}</td>
                      )}
                      {candidateColumnVisible('email') && (
                        <td className="px-5 py-4 text-neutral-500">{candidate.candidate_email}</td>
                      )}
                      {candidateColumnVisible('started') && (
                        <td className="px-5 py-4 text-neutral-600">{candidate.started_at ? formatDateTime(candidate.started_at) : 'Not started'}</td>
                      )}
                      {candidateColumnVisible('duration') && (
                        <td className="px-5 py-4 text-neutral-500">{getSessionDurationLabel(candidate)}</td>
                      )}
                      {candidateColumnVisible('sessionStatus') && (
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColors[visibleStatus] ?? statusColors.pending}`}>
                            {statusLabels[visibleStatus] ?? visibleStatus}
                          </span>
                        </td>
                      )}
                      {candidateColumnVisible('candidateStatus') && (
                        <td className="px-5 py-4">
                          {candidate.candidate_lifecycle_status && (
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${lifecycleStatusColors[candidate.candidate_lifecycle_status]}`}>
                              {lifecycleStatusLabels[candidate.candidate_lifecycle_status]}
                            </span>
                          )}
                        </td>
                      )}
                      {candidateColumnVisible('decision') && (
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getDecisionColor(candidate.decision_label)}`}>
                            {candidate.decision_label ? decisionLabels[candidate.decision_label] : 'No decision'}
                          </span>
                        </td>
                      )}
                      {candidateColumnVisible('inviteEmail') && (
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${inviteEmailStatusColors[candidate.invite_email_status || 'not_sent']}`}>
                            {inviteEmailStatusLabels[candidate.invite_email_status || 'not_sent']}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {candidateColumnsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCandidateColumnsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-columns-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
              <div>
                <p id="assessment-columns-title" className="text-sm font-semibold text-white">Table Columns</p>
                <p className="mt-1 text-xs text-neutral-500">Choose which candidate fields are shown.</p>
              </div>
              <button
                type="button"
                onClick={() => setCandidateColumnsOpen(false)}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close column selector"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
              {candidateColumns.map((column) => {
                const checked = draftCandidateColumns.has(column.id);
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/3"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={column.locked}
                      onChange={() => toggleDraftCandidateColumn(column.id)}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">{column.label}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">{column.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-white/5 px-5 py-4">
              <button
                type="button"
                onClick={() => setDraftCandidateColumns(new Set(defaultCandidateColumns))}
                className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyCandidateColumns}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-primary-light"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
