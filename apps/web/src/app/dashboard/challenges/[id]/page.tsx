'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Archive, Ban, BarChart3, CalendarClock, Copy, Download, FileText, FolderCode, Link2, MailCheck, MailPlus, MailX, MessageSquareText, Power, RotateCcw, Save, Send, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Trash2, UserMinus, UserX, Users } from 'lucide-react';
import { formatDateTime, getDecisionColor, getDecisionLabel } from '@/lib/utils';
import { DEFAULT_INVITE_EMAIL_BODY, DEFAULT_INVITE_EMAIL_SUBJECT, INVITE_EMAIL_MERGE_FIELDS } from '@/lib/invite-email';
import MarkdownViewer from '@/components/MarkdownViewer';
import ConfirmationModal from '@/components/ConfirmationModal';
import StarterFilesEditor from '@/components/dashboard/StarterFilesEditor';
import DuplicateChallengeModal from '@/components/dashboard/DuplicateChallengeModal';
import ArcSpinner from '@/components/ArcSpinner';
import { useSubscription } from '@/context/SubscriptionContext';
import { useAuth } from '@/context/AuthContext';
import type { CandidateLifecycleStatus, Challenge, Session, StarterFile } from '@/types';

interface ChallengeDetail extends Challenge {
  sessions: Session[];
}

type ChallengeTab = 'description' | 'starter-files' | 'distribution' | 'invites' | 'candidates' | 'analytics' | 'settings';

function parseChallengeTab(value: string | null): ChallengeTab {
  switch (value) {
    case 'starter-files':
    case 'distribution':
    case 'invites':
    case 'candidates':
    case 'analytics':
    case 'settings':
      return value;
    default:
      return 'description';
  }
}

type AnalyticsItem = {
  key?: string;
  label: string;
  count: number;
  percent?: number;
};

type ChallengeAnalytics = {
  totalSessions: number;
  startedCount: number;
  completedCount: number;
  analyzedCount: number;
  activeCount: number;
  pendingCount: number;
  averageScore: number | null;
  averageDurationMinutes: number | null;
  funnel: AnalyticsItem[];
  scoreBands: AnalyticsItem[];
  recommendationDistribution: AnalyticsItem[];
  decisionDistribution: AnalyticsItem[];
  lifecycleCounts: {
    noShow: number;
    withdrawn: number;
    disqualified: number;
    revoked: number;
  };
  capacity: {
    limit: number | null;
    used: number;
    percent: number | null;
  };
  accessWindow: {
    startsAt: string | null;
    endsAt: string | null;
    status: 'not_set' | 'not_started' | 'open' | 'ended';
    elapsedPercent: number | null;
  };
};

type SettingsForm = {
  title: string;
  description: string;
  timeLimitMin: string;
  cohortLabel: string;
  role: string;
  techStack: string[];
  seniority: string;
  focusAreas: string[];
  context: string;
};

type RoleOption = {
  id: string;
  name: string;
  description: string;
};

type Option = {
  value: string;
  label: string;
};

type LifecycleAction =
  | 'revoke'
  | 'regenerate_link'
  | 'send_invite_email'
  | 'mark_no_show'
  | 'mark_withdrawn'
  | 'mark_disqualified'
  | 'clear_lifecycle';

type CandidateColumnId =
  | 'candidate'
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
  'duration',
  'sessionStatus',
  'candidateStatus',
  'decision',
]);

const roleOptions: RoleOption[] = [
  { id: 'full-stack', name: 'Full-Stack', description: 'End-to-end web applications' },
  { id: 'backend', name: 'Backend', description: 'APIs, services, databases' },
  { id: 'frontend', name: 'Frontend', description: 'UI, components, client apps' },
  { id: 'data-ml', name: 'Data / ML', description: 'Data pipelines and ML systems' },
  { id: 'devops', name: 'DevOps', description: 'Infrastructure and automation' },
];

const techSuggestions: Record<string, string[]> = {
  backend: ['Node.js', 'Python', 'Go', 'Java', 'Express', 'FastAPI', 'Django', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL'],
  frontend: ['React', 'Vue', 'Angular', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Redux'],
  'full-stack': ['React', 'Next.js', 'Node.js', 'TypeScript', 'Python', 'PostgreSQL', 'MongoDB', 'Redis', 'Express', 'Tailwind CSS', 'GraphQL'],
  'data-ml': ['Python', 'pandas', 'scikit-learn', 'SQL', 'Spark', 'PyTorch', 'TensorFlow'],
  devops: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Bash', 'Ansible'],
};

const seniorityOptions: Option[] = [
  { value: 'junior', label: 'Junior (0-2 yrs)' },
  { value: 'mid', label: 'Mid-Level (2-5 yrs)' },
  { value: 'senior', label: 'Senior (5-8 yrs)' },
  { value: 'staff', label: 'Staff / Principal (8+ yrs)' },
];

const focusOptions: Option[] = [
  { value: 'debugging', label: 'Debugging' },
  { value: 'system-design', label: 'System Design' },
  { value: 'api-design', label: 'API Design' },
  { value: 'testing', label: 'Testing' },
  { value: 'refactoring', label: 'Refactoring' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'data-modeling', label: 'Data Modeling' },
];

const emptySettingsForm: SettingsForm = {
  title: '',
  description: '',
  timeLimitMin: '',
  cohortLabel: '',
  role: '',
  techStack: [],
  seniority: '',
  focusAreas: [],
  context: '',
};

function parseStarterFiles(raw: unknown): StarterFile[] {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(parsed)
    ? parsed.filter((file): file is StarterFile => Boolean(file?.path))
    : [];
}

function parseCsvList(value: string | null | undefined): string[] {
  return value
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
}

function challengeToSettingsForm(challenge: Challenge): SettingsForm {
  return {
    title: challenge.title ?? '',
    description: challenge.description ?? '',
    timeLimitMin: String(challenge.time_limit_min ?? ''),
    cohortLabel: challenge.cohort_label ?? '',
    role: challenge.role ?? '',
    techStack: parseCsvList(challenge.tech_stack),
    seniority: challenge.seniority ?? '',
    focusAreas: parseCsvList(challenge.focus_areas),
    context: challenge.context ?? '',
  };
}

function formatAnalyticsPercent(value: number | null | undefined) {
  return value == null ? 'N/A' : `${value}%`;
}

function formatDurationMinutes(value: number | null) {
  if (value == null) return 'N/A';
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getSessionDurationLabel(session: Session) {
  if (!session.started_at) return 'Not started';
  if (!session.ended_at) return 'In progress';

  const startedAt = new Date(session.started_at).getTime();
  const endedAt = new Date(session.ended_at).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return 'N/A';
  }

  return formatDurationMinutes(Math.ceil((endedAt - startedAt) / 60000));
}

function AnalyticsMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="border-l border-white/10 pl-4 first:border-l-0 first:pl-0">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail && <p className="mt-1 text-xs text-neutral-500">{detail}</p>}
    </div>
  );
}

function AnalyticsRows({
  items,
  total,
  emptyLabel = 'No data yet',
}: {
  items: AnalyticsItem[];
  total: number;
  emptyLabel?: string;
}) {
  const hasData = items.some((item) => item.count > 0);

  if (!hasData) {
    return <p className="text-sm text-neutral-600">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const itemPercent = item.percent ?? (total > 0 ? Math.round((item.count / total) * 100) : 0);
        return (
          <div key={item.key ?? item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-300">{item.label}</span>
              <span className="text-neutral-500">{item.count} - {itemPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, itemPercent))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeId = params.id as string;
  const { planStatus, refreshSubscription } = useSubscription();
  const { user, loading: authLoading } = useAuth();
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChallengeTab>(() => parseChallengeTab(searchParams.get('tab')));
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteLinkEmail, setInviteLinkEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSendEmail, setInviteSendEmail] = useState(false);
  const [inviteEmailStatus, setInviteEmailStatus] = useState<'not_sent' | 'sent' | 'failed' | ''>('');
  const [inviteEmailError, setInviteEmailError] = useState('');
  const [inviteEmailSubject, setInviteEmailSubject] = useState(DEFAULT_INVITE_EMAIL_SUBJECT);
  const [inviteEmailBody, setInviteEmailBody] = useState(DEFAULT_INVITE_EMAIL_BODY);
  const [inviteTemplateSaving, setInviteTemplateSaving] = useState(false);
  const [inviteTemplateSaved, setInviteTemplateSaved] = useState(false);
  const [inviteTemplateError, setInviteTemplateError] = useState('');
  const [analysisStartingIds, setAnalysisStartingIds] = useState<Set<string>>(new Set());
  const [copiedShareable, setCopiedShareable] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copyingSessionId, setCopyingSessionId] = useState<string | null>(null);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [allowedEmailsSaving, setAllowedEmailsSaving] = useState(false);
  const [allowedEmailsSaved, setAllowedEmailsSaved] = useState(false);
  const [accessIsActive, setAccessIsActive] = useState(true);
  const [accessStartsAt, setAccessStartsAt] = useState('');
  const [accessEndsAt, setAccessEndsAt] = useState('');
  const [accessSessionsLimit, setAccessSessionsLimit] = useState('');
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessSaved, setAccessSaved] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [starterFiles, setStarterFiles] = useState<StarterFile[]>([]);
  const [savedStarterFiles, setSavedStarterFiles] = useState<StarterFile[]>([]);
  const [starterFilesSaving, setStarterFilesSaving] = useState(false);
  const [starterFilesSaved, setStarterFilesSaved] = useState(false);
  const [starterFilesError, setStarterFilesError] = useState('');
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(emptySettingsForm);
  const [settingsCustomTech, setSettingsCustomTech] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [modalMessage, setModalMessage] = useState<{ title: string; description: string } | null>(null);
  const [reviewPreviewSession, setReviewPreviewSession] = useState<Session | null>(null);
  const [closeAccessModalOpen, setCloseAccessModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [analysisNow, setAnalysisNow] = useState(() => Date.now());
  const [lifecycleBusyIds, setLifecycleBusyIds] = useState<Set<string>>(new Set());
  const [lifecycleMessage, setLifecycleMessage] = useState<{ sessionId: string; message: string; tone: 'success' | 'error' } | null>(null);
  const [lifecycleConfirmAction, setLifecycleConfirmAction] = useState<'mark_withdrawn' | 'mark_disqualified' | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(() => searchParams.get('candidateId'));
  const [analytics, setAnalytics] = useState<ChallengeAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [candidateColumnsOpen, setCandidateColumnsOpen] = useState(false);
  const [visibleCandidateColumns, setVisibleCandidateColumns] = useState<Set<CandidateColumnId>>(
    () => new Set(defaultCandidateColumns)
  );
  const [draftCandidateColumns, setDraftCandidateColumns] = useState<Set<CandidateColumnId>>(
    () => new Set(defaultCandidateColumns)
  );

  const fetchChallengeDetail = useCallback(async (): Promise<ChallengeDetail> => {
    const res = await fetch(`/api/challenges/${challengeId}`);
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !Array.isArray(data.sessions)) {
      throw new Error(data?.error || 'Failed to load challenge');
    }

    return data;
  }, [challengeId]);

  const fetchChallengeAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}/analytics`);
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to load analytics');
      }

      setAnalytics(data);
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [challengeId]);

  function toDateTimeLocal(value: string | null | undefined) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  useEffect(() => {
    fetchChallengeDetail()
      .then((data) => {
        const files = parseStarterFiles(data.starter_files);
        setChallenge(data);
        setAllowedEmails(data.allowed_emails ?? []);
        setAccessIsActive(data.is_active === true || data.is_active === 1);
        setAccessStartsAt(toDateTimeLocal(data.starts_at));
        setAccessEndsAt(toDateTimeLocal(data.ends_at));
        setAccessSessionsLimit(data.sessions_limit != null ? String(data.sessions_limit) : '');
        setStarterFiles(files);
        setSavedStarterFiles(files);
        setSettingsForm(challengeToSettingsForm(data));
        setInviteEmailSubject(data.invite_email_subject || DEFAULT_INVITE_EMAIL_SUBJECT);
        setInviteEmailBody(data.invite_email_body || DEFAULT_INVITE_EMAIL_BODY);
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

  useEffect(() => {
    const interval = window.setInterval(() => setAnalysisNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics && !analyticsLoading && !analyticsError) {
      void fetchChallengeAnalytics();
    }
  }, [activeTab, analytics, analyticsError, analyticsLoading, fetchChallengeAnalytics]);

  useEffect(() => {
    if (activeTab !== 'candidates' || !selectedCandidateId || !challenge) return;
    const row = document.getElementById(`candidate-row-${selectedCandidateId}`);
    row?.scrollIntoView({ block: 'center' });
  }, [activeTab, challenge, selectedCandidateId]);

  const starterFileCount = starterFiles.filter((file) => file.path && !file.path.endsWith('/.gitkeep')).length;
  const hasStarterFileChanges = useMemo(
    () => JSON.stringify(starterFiles) !== JSON.stringify(savedStarterFiles),
    [starterFiles, savedStarterFiles]
  );
  const hasStartedSession = challenge?.sessions.some((session) => Boolean(session.started_at)) ?? false;
  const activeSessionCount = challenge?.sessions.filter((session) => session.status === 'active').length ?? 0;
  const challengeIsOpen = Boolean(challenge?.is_active);
  const canGenerateInvite = challengeIsOpen && accessIsActive;
  const inviteDisabledReason = !challengeIsOpen
    ? 'Invites are disabled while the challenge is closed. Open the challenge and save access settings before generating invites.'
    : !accessIsActive
      ? 'Invites are disabled while the challenge is staged to close. Save access settings or reopen it first.'
      : null;
  const availableAssessmentCount = planStatus?.sessionsLimit === -1
    ? null
    : planStatus
      ? Math.max(0, planStatus.sessionsLimit - planStatus.sessionsUsed)
      : undefined;
  const activeTechSuggestions = techSuggestions[settingsForm.role] ?? Object.values(techSuggestions).flat();
  const uniqueTechSuggestions = Array.from(new Set(activeTechSuggestions));
  const hasCustomRole = settingsForm.role && !roleOptions.some((option) => option.id === settingsForm.role);
  const hasCustomSeniority = settingsForm.seniority && !seniorityOptions.some((option) => option.value === settingsForm.seniority);
  const customFocusAreas = settingsForm.focusAreas.filter(
    (area) => !focusOptions.some((option) => option.value === area)
  );

  useEffect(() => {
    if (typeof availableAssessmentCount !== 'number' || accessSessionsLimit === '') return;
    const parsed = Number(accessSessionsLimit);
    if (Number.isFinite(parsed) && parsed > availableAssessmentCount) {
      setAccessSessionsLimit(String(availableAssessmentCount));
    }
  }, [accessSessionsLimit, availableAssessmentCount]);

  const assessmentUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${challengeId}` : `/apply/${challengeId}`;

  const canManageChallenge = Boolean(user?.isAdmin || user?.role === 'owner' || user?.role === 'recruiter');

  const tabs = [
    { id: 'description' as const, label: 'Description', icon: FileText },
    { id: 'starter-files' as const, label: 'Starter Files', icon: FolderCode, badge: starterFileCount, writeOnly: true },
    { id: 'distribution' as const, label: 'Access Control', icon: Link2, writeOnly: true },
    { id: 'invites' as const, label: 'Invites', icon: MailPlus, writeOnly: true },
    { id: 'candidates' as const, label: 'Candidates', icon: Users, badge: challenge?.sessions.length ?? 0 },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as const, label: 'Settings', icon: SettingsIcon, writeOnly: true },
  ].filter((tab) => canManageChallenge || !tab.writeOnly);

  useEffect(() => {
    if (authLoading || canManageChallenge) return;
    if (activeTab === 'starter-files' || activeTab === 'distribution' || activeTab === 'invites' || activeTab === 'settings') {
      setActiveTab('description');
    }
  }, [activeTab, authLoading, canManageChallenge]);

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

  function getAnalysisAlertLabel(session: Session) {
    const referenceTime = new Date(session.ended_at ?? session.created_at).getTime();
    const minutes = Number.isFinite(referenceTime)
      ? Math.floor((analysisNow - referenceTime) / 60000)
      : 0;

    if (session.status === 'analysis failed') return 'Failed - retry available';
    if (session.status === 'completed' && minutes >= 5) return 'Ready to analyze';
    return null;
  }

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

  function handleAccessSessionsLimitChange(value: string) {
    if (value === '') {
      setAccessSessionsLimit('');
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    const normalized = Math.max(0, Math.floor(parsed));
    const capped = typeof availableAssessmentCount === 'number'
      ? Math.min(normalized, availableAssessmentCount)
      : normalized;
    setAccessSessionsLimit(String(capped));
  }

  function addSettingsTech(tech: string) {
    const trimmed = tech.trim();
    if (!trimmed) return;
    setSettingsForm((form) => (
      form.techStack.includes(trimmed)
        ? form
        : { ...form, techStack: [...form.techStack, trimmed] }
    ));
  }

  function removeSettingsTech(tech: string) {
    setSettingsForm((form) => ({
      ...form,
      techStack: form.techStack.filter((item) => item !== tech),
    }));
  }

  function handleSettingsCustomTechKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addSettingsTech(settingsCustomTech);
    setSettingsCustomTech('');
  }

  function toggleSettingsFocusArea(area: string) {
    setSettingsForm((form) => {
      if (form.focusAreas.includes(area)) {
        return { ...form, focusAreas: form.focusAreas.filter((item) => item !== area) };
      }
      if (form.focusAreas.length >= 4) return form;
      return { ...form, focusAreas: [...form.focusAreas, area] };
    });
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

  async function handleSaveAccessSettings() {
    setAccessSaving(true);
    setAccessSaved(false);
    setAccessError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: accessIsActive,
          sessions_limit: accessSessionsLimit ? parseInt(accessSessionsLimit) : null,
          starts_at: accessStartsAt ? new Date(accessStartsAt).toISOString() : null,
          ends_at: accessEndsAt ? new Date(accessEndsAt).toISOString() : null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save assessment access settings');
      }

      setChallenge((current) => current ? { ...current, ...data } : current);
      setAccessIsActive(data.is_active === true || data.is_active === 1);
      setAccessSaved(true);
      setTimeout(() => setAccessSaved(false), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save assessment access settings';
      setAccessError(message);
      if (message.includes('Session limit cannot exceed')) {
        setModalMessage({
          title: 'Session Limit Needs Review',
          description: `${message} The saved session limit may need to be lowered before changing access settings.`,
        });
      }
    } finally {
      setAccessSaving(false);
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

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsSaved(false);
    setSettingsError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: settingsForm.title,
          description: settingsForm.description,
          time_limit_min: settingsForm.timeLimitMin ? Number(settingsForm.timeLimitMin) : '',
          cohort_label: settingsForm.cohortLabel,
          role: settingsForm.role,
          tech_stack: settingsForm.techStack.join(', '),
          seniority: settingsForm.seniority,
          focus_areas: settingsForm.focusAreas.join(', '),
          context: settingsForm.context,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save settings');
      }

      setChallenge((current) => current ? { ...current, ...data } : current);
      setSettingsForm(challengeToSettingsForm(data));
      setSettingsCustomTech('');
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSaveInviteTemplate() {
    setInviteTemplateSaving(true);
    setInviteTemplateSaved(false);
    setInviteTemplateError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_email_subject: inviteEmailSubject,
          invite_email_body: inviteEmailBody,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save invite email template');
      }

      setChallenge((current) => current ? { ...current, ...data } : current);
      setInviteEmailSubject(data.invite_email_subject || DEFAULT_INVITE_EMAIL_SUBJECT);
      setInviteEmailBody(data.invite_email_body || DEFAULT_INVITE_EMAIL_BODY);
      setInviteTemplateSaved(true);
      setTimeout(() => setInviteTemplateSaved(false), 2500);
    } catch (err) {
      setInviteTemplateError(err instanceof Error ? err.message : 'Failed to save invite email template');
    } finally {
      setInviteTemplateSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canGenerateInvite) return;

    setInviteLoading(true);
    setInviteError('');
    setInviteEmailStatus('');
    setInviteEmailError('');

    try {
      const res = await fetch(`/api/challenges/${challengeId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: inviteForm.name,
          candidate_email: inviteForm.email,
          send_email: inviteSendEmail,
          email_subject: inviteEmailSubject,
          email_body: inviteEmailBody,
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        setInviteLink(`${window.location.origin}${data.invite_url}`);
        setInviteLinkEmail(inviteForm.email.trim().toLowerCase());
        setCopiedInviteLink(false);
        setInviteEmailStatus(data.email_status ?? (inviteSendEmail ? 'failed' : 'not_sent'));
        setInviteEmailError(data.email_error ?? '');
        const normalizedEmail = inviteForm.email.trim().toLowerCase();
        setAllowedEmails((current) => current.includes(normalizedEmail) ? current : [...current, normalizedEmail]);
        setInviteForm({ name: '', email: '' });
        setChallenge(await fetchChallengeDetail());
        setAnalytics(null);
        setAnalyticsError('');
        await refreshSubscription();
      } else {
        throw new Error(data?.error || 'Failed to generate invite');
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to generate invite');
    } finally {
      setInviteLoading(false);
    }
  }

  function clearInviteResult() {
    setInviteLink('');
    setInviteLinkEmail('');
    setCopiedInviteLink(false);
    setInviteEmailStatus('');
    setInviteEmailError('');
  }

  async function handleArchiveChallenge(close = false) {
    if (!challenge) return;

    try {
      const res = await fetch(`/api/challenges/${challenge.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archived: !challenge.archived_at,
          close,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to update archive state');
      }

      setChallenge((current) => current ? { ...current, ...data } : current);
      setArchiveModalOpen(false);
    } catch (error) {
      setModalMessage({
        title: 'Archive Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update archive state.',
      });
      setArchiveModalOpen(false);
    }
  }

  function updateSessionStatus(sessionId: string, status: Session['status']) {
    setAnalytics(null);
    setAnalyticsError('');
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

  async function refreshChallengeAfterAnalysisFailure() {
    try {
      setChallenge(await fetchChallengeDetail());
      setAnalytics(null);
      setAnalyticsError('');
    } catch {
      // Keep the current UI state if the refresh fails.
    }
  }

  async function handleAnalyze(sessionId: string) {
    setAnalysisStartingIds((current) => new Set(current).add(sessionId));
    try {
      const res = await fetch(`/api/analysis/${sessionId}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
        await refreshChallengeAfterAnalysisFailure();
        setModalMessage({
          title: 'Analysis Failed',
          description: err.error || 'Analysis failed. Check console for details.',
        });
        return;
      }
      updateSessionStatus(sessionId, 'queued');
    } catch {
      await refreshChallengeAfterAnalysisFailure();
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

  async function copySessionLink(session: Session) {
    const url = `${window.location.origin}/session/${session.token}`;
    setCopyingSessionId(session.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSessionId(session.id);
      setTimeout(() => setCopiedSessionId(null), 2000);
    } finally {
      setCopyingSessionId(null);
    }
  }

  function updateSession(updatedSession: Session) {
    setAnalytics(null);
    setAnalyticsError('');
    setChallenge((current) => current
      ? {
        ...current,
        sessions: current.sessions.map((session) => (
          session.id === updatedSession.id ? updatedSession : session
        )),
      }
      : current
    );
  }

  function lifecycleBusyKey(sessionId: string, action: LifecycleAction) {
    return `${sessionId}:${action}`;
  }

  function canManagePendingInvite(session: Session) {
    return session.status === 'pending' && !session.started_at && !session.candidate_lifecycle_status;
  }

  const POST_ASSESSMENT_STATUSES = new Set(['completed', 'queued', 'analyzing', 'analyzed', 'analysis failed']);

  function hasCompletedAssessment(session: Session) {
    return POST_ASSESSMENT_STATUSES.has(session.status);
  }

  function lifecycleConfirmDescription(session: Session | null, action: 'mark_withdrawn' | 'mark_disqualified' | null) {
    if (!session || !action) return '';
    const actionWord = action === 'mark_withdrawn' ? 'withdrawn' : 'disqualified';

    if (session.status === 'analyzed') {
      return `This candidate has already completed the assessment and been scored. Marking them ${actionWord} flags them in the candidate list, but their score and report stay visible and still count toward this challenge's analytics unless you also update their decision label.`;
    }
    if (hasCompletedAssessment(session)) {
      return `This candidate is past the pending stage of the assessment. Marking them ${actionWord} flags them in the candidate list; it does not remove or change their session.`;
    }
    return `This flags the candidate as ${actionWord} for this challenge. You can clear this status later if needed.`;
  }

  async function handleLifecycleAction(session: Session, action: LifecycleAction) {
    const key = lifecycleBusyKey(session.id, action);
    setLifecycleBusyIds((current) => new Set(current).add(key));
    setLifecycleMessage(null);

    try {
      const res = await fetch(`/api/session-lifecycle/${session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (data?.session) updateSession(data.session);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update candidate');
      }

      if (action === 'regenerate_link' && data?.invite_url) {
        const url = `${window.location.origin}${data.invite_url}`;
        await navigator.clipboard.writeText(url);
        setCopiedSessionId(session.id);
        setTimeout(() => setCopiedSessionId(null), 2000);
        setLifecycleMessage({ sessionId: session.id, message: 'New link copied', tone: 'success' });
      } else if (action === 'send_invite_email') {
        setLifecycleMessage({ sessionId: session.id, message: 'Invite email sent', tone: 'success' });
      } else {
        setLifecycleMessage({ sessionId: session.id, message: 'Updated', tone: 'success' });
      }
    } catch (error) {
      setLifecycleMessage({
        sessionId: session.id,
        message: error instanceof Error ? error.message : 'Failed to update candidate',
        tone: 'error',
      });
    } finally {
      setLifecycleBusyIds((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function handleLifecycleSelect(session: Session, value: string) {
    if (!value) return;
    void handleLifecycleAction(session, value as LifecycleAction);
  }

  async function confirmLifecycleAction() {
    if (!selectedCandidate || !lifecycleConfirmAction) return;
    await handleLifecycleAction(selectedCandidate, lifecycleConfirmAction);
    setLifecycleConfirmAction(null);
  }

  function candidateColumnVisible(columnId: CandidateColumnId) {
    return visibleCandidateColumns.has(columnId);
  }

  function openCandidateColumnsModal() {
    setDraftCandidateColumns(new Set(visibleCandidateColumns));
    setCandidateColumnsOpen(true);
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  if (!challenge) return <p className="text-neutral-500">Challenge not found</p>;

  const selectedCandidate = selectedCandidateId
    ? challenge.sessions.find((session) => session.id === selectedCandidateId) ?? null
    : null;
  const selectedVisibleStatus = selectedCandidate
    ? analysisStartingIds.has(selectedCandidate.id) ? 'queued' : selectedCandidate.status
    : null;
  const selectedCanUsePendingActions = selectedCandidate && canManageChallenge ? canManagePendingInvite(selectedCandidate) : false;
  const selectedSendBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'send_invite_email')) : false;
  const selectedRegenerateBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'regenerate_link')) : false;
  const selectedRevokeBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'revoke')) : false;
  const selectedNoShowBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'mark_no_show')) : false;
  const selectedWithdrawnBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'mark_withdrawn')) : false;
  const selectedDisqualifiedBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'mark_disqualified')) : false;
  const selectedClearBusy = selectedCandidate ? lifecycleBusyIds.has(lifecycleBusyKey(selectedCandidate.id, 'clear_lifecycle')) : false;
  const selectedAnalyzeBusy = selectedCandidate ? analysisStartingIds.has(selectedCandidate.id) : false;
  const selectedCopyBusy = selectedCandidate ? copyingSessionId === selectedCandidate.id : false;
  const selectedCandidateStatus = selectedCandidate?.candidate_lifecycle_status ?? null;
  const selectedCanMarkNoShow = selectedCandidate && canManageChallenge ? selectedCandidate.status === 'pending' && !selectedCandidate.started_at : false;
  const selectedCanCopyInviteLink = selectedCandidate && canManageChallenge ? canManagePendingInvite(selectedCandidate) : false;

  const selectedActionButtonClass = 'inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950 disabled:text-neutral-600';

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-white/10 bg-[#0a0a0a]/95 px-6 pt-6 backdrop-blur supports-backdrop-filter:bg-[#0a0a0a]/85">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-serif italic text-white">{challenge.title}</h1>
              {challenge.archived_at && (
                <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-400">
                  Archived
                </span>
              )}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${Boolean(challenge.is_active) ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-400'
                }`}>
                {Boolean(challenge.is_active) ? 'Open' : 'Closed'}
              </span>
              {challenge.cohort_label && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-400">
                  {challenge.cohort_label}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {challenge.time_limit_min} min
              </span>
            </div>
            <p className="mt-1 text-neutral-500">Assessment duration</p>
          </div>

          {canManageChallenge && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDuplicateModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => setArchiveModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
            >
              {challenge.archived_at ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Archive className="h-4 w-4" aria-hidden="true" />
              )}
              {challenge.archived_at ? 'Unarchive' : 'Archive'}
            </button>
          </div>
          )}
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
                  className={`flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${isActive
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
        <div className="px-6 pb-6">
          {challenge.description ? <MarkdownViewer content={challenge.description} /> : <p className="text-neutral-600">No description configured.</p>}
        </div>
      )}

      {canManageChallenge && activeTab === 'starter-files' && (
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
          <div className="h-140 min-h-0 rounded-2xl bg-surface">
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

      {canManageChallenge && activeTab === 'distribution' && (
        <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-primary/20 bg-[#0f1210]">
              <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${Boolean(challenge.is_active) ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-400'
                    }`}>
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Shareable Link</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {Boolean(challenge.is_active)
                        ? 'Public registration path'
                        : 'New candidates cannot enter while this assessment is closed'}
                    </p>
                  </div>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${Boolean(challenge.is_active) ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-400'
                  }`}>
                  {Boolean(challenge.is_active) ? 'Open' : 'Closed'}
                </span>
              </div>
              <div className="flex flex-col gap-3 p-5 lg:flex-row">
                <input
                  type="text"
                  value={assessmentUrl}
                  readOnly
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-xs font-mono text-primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(assessmentUrl);
                    setCopiedShareable(true);
                    setTimeout(() => setCopiedShareable(false), 2000);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-black transition-all hover:bg-primary-light"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copiedShareable ? 'Copied' : 'Copy Link'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-surface">
              <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-neutral-300">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Access Rules</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Applied to personalized invites and the public link</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-0 lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.1fr)]">
                <div className="border-b border-white/5 p-5 lg:col-span-2">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${accessIsActive ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-400'
                        }`}>
                        <Power className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <label htmlFor="challenge-open-toggle" className="block text-sm font-semibold text-white">
                          Challenge Open / Closed
                        </label>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                          {accessIsActive
                            ? 'Open. Candidates can enter when the window, allowlist, and capacity rules allow.'
                            : `Closed. New entries and pending starts are blocked. ${activeSessionCount > 0 ? `${activeSessionCount} active session${activeSessionCount !== 1 ? 's' : ''} can finish.` : 'Completed reports and candidate history stay available.'}`}
                        </p>
                      </div>
                    </div>
                    <button
                      id="challenge-open-toggle"
                      type="button"
                      role="switch"
                      aria-checked={accessIsActive}
                      onClick={() => {
                        if (accessIsActive) {
                          setCloseAccessModalOpen(true);
                          return;
                        }
                        setAccessIsActive(true);
                        setAccessSaved(false);
                      }}
                      className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${accessIsActive
                          ? 'border-primary/40 bg-primary/25'
                          : 'border-white/10 bg-white/5'
                        }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full transition-[left,background-color] ${accessIsActive
                            ? 'left-7 bg-primary'
                            : 'left-1 bg-neutral-500'
                          }`}
                      />
                      <span className="sr-only">{accessIsActive ? 'Close assessment' : 'Open assessment'}</span>
                    </button>
                  </div>
                  {!accessIsActive && (
                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200/90">
                      This assessment is staged to close. Save Access Settings to block new entries; candidates already inside an active workspace are not forcibly removed.
                    </div>
                  )}
                </div>

                <div className="border-b border-white/5 p-5 lg:border-b-0 lg:border-r lg:border-white/5">
                  <label className="block text-xs font-medium uppercase tracking-[0.16em] text-primary">Session Limit</label>
                  <div className="mt-3 flex items-end gap-3">
                    <input
                      type="number"
                      min={0}
                      max={typeof availableAssessmentCount === 'number' ? availableAssessmentCount : undefined}
                      value={accessSessionsLimit}
                      onChange={(e) => handleAccessSessionsLimitChange(e.target.value)}
                      placeholder="Plan"
                      className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-40"
                    />
                    <div className="pb-2">
                      <p className="text-xs text-neutral-500">Available</p>
                      <p className="text-sm font-medium text-white">
                        {availableAssessmentCount === null
                          ? 'Unlimited'
                          : availableAssessmentCount === undefined
                            ? 'Checking...'
                            : `${availableAssessmentCount} assessment${availableAssessmentCount !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: accessSessionsLimit && typeof availableAssessmentCount === 'number' && availableAssessmentCount > 0
                          ? `${Math.min(100, Math.round((Number(accessSessionsLimit) / availableAssessmentCount) * 100))}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">Blank uses the plan&apos;s remaining assessment capacity.</p>
                </div>

                <div className="p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
                    <CalendarClock className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                    Assessment Window
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-neutral-500">Starts</label>
                      <input
                        type="datetime-local"
                        value={accessStartsAt}
                        onChange={(e) => setAccessStartsAt(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-neutral-500">Ends</label>
                      <input
                        type="datetime-local"
                        value={accessEndsAt}
                        onChange={(e) => setAccessEndsAt(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">The window controls entry. It does not end an already-started assessment.</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {accessSaved && <span className="text-xs text-primary">Saved</span>}
                  {accessError && <span className="text-xs text-red-400">{accessError}</span>}
                </div>
                <button
                  type="button"
                  onClick={handleSaveAccessSettings}
                  disabled={accessSaving}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-primary-light disabled:opacity-50"
                >
                  {accessSaving ? 'Saving...' : 'Save Access Settings'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-surface">
              <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Candidate Email Allowlist</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {allowedEmails.length === 0
                      ? 'Open to anyone with the shareable link'
                      : `${allowedEmails.length} email${allowedEmails.length !== 1 ? 's' : ''} allowed through the shareable link`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {allowedEmailsSaved && <span className="text-xs text-primary">Saved</span>}
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
                    {allowedEmailsSaving ? 'Saving...' : 'Save Allowlist'}
                  </button>
                </div>
              </div>

              <div className="p-5">
                <div
                  className="flex min-h-14 cursor-text flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2.5"
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
                    placeholder={allowedEmails.length === 0 ? 'Add email and press Enter...' : ''}
                    className="min-w-55 flex-1 bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
        </div>
      )}

      {canManageChallenge && activeTab === 'invites' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-surface">
              <div className="border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${canGenerateInvite ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-500'
                    }`}>
                    {canGenerateInvite ? (
                      <MailPlus className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <MailX className="h-4 w-4" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Personalized Invite</h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {inviteDisabledReason ?? 'Create a session link and optionally email it'}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleInvite} className="space-y-4 p-5">
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-500">Name</label>
                  <input
                    type="text"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                    disabled={!canGenerateInvite || inviteLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-500">Email</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={!canGenerateInvite || inviteLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${inviteSendEmail ? 'border-primary/30 bg-primary/10' : 'border-white/10 bg-black/25'}`}>
                  <input
                    type="checkbox"
                    checked={inviteSendEmail}
                    onChange={(e) => setInviteSendEmail(e.target.checked)}
                    disabled={!canGenerateInvite || inviteLoading}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium text-white">Send email now</span>
                    <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                      Uses the template on this page. The link is still shown for manual fallback.
                    </span>
                  </span>
                </label>

                {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
                <button
                  type="submit"
                  disabled={inviteLoading || !canGenerateInvite}
                  className="btn-glow inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-black transition-all hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviteSendEmail ? <Send className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {inviteLoading ? 'Generating...' : inviteSendEmail ? 'Generate and Send Email' : 'Generate Invite Link'}
                </button>
              </form>
            </div>

          <div className="rounded-2xl border border-white/5 bg-surface">
            <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Candidate Link</p>
                <p className="mt-0.5 text-xs text-neutral-500">Generated invite links appear here for copying.</p>
              </div>
              {inviteLink && (
                <button
                  type="button"
                  onClick={clearInviteResult}
                  className="inline-flex w-fit items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>
            <div className="p-5">
              {inviteLink ? (
                <div className="space-y-3">
                  {inviteLinkEmail && (
                    <div className="rounded-xl border border-white/5 bg-black/25 px-3 py-2">
                      <p className="text-xs text-neutral-500">Generated for</p>
                      <p className="mt-0.5 break-all text-sm font-medium text-white">{inviteLinkEmail}</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        value={inviteLink}
                        readOnly
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-xs font-mono text-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink);
                          setCopiedInviteLink(true);
                          setTimeout(() => setCopiedInviteLink(false), 2000);
                        }}
                        className="rounded-xl bg-white/5 px-4 py-3 text-xs font-semibold text-neutral-300 transition-colors hover:bg-white/10"
                      >
                        {copiedInviteLink ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {inviteEmailStatus === 'sent' && (
                      <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <MailCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Email sent
                      </p>
                    )}
                    {inviteEmailStatus === 'failed' && (
                      <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
                        {inviteEmailError || 'Email could not be sent. The invite link is ready to copy.'}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/5 bg-black/25 px-4 py-6 text-center text-sm text-neutral-600">
                    Generate a personalized invite to create a candidate-specific session link.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-surface">
            <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Email Template</p>
                <p className="mt-0.5 text-xs text-neutral-500">Saved as this challenge&apos;s default invite message.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {inviteTemplateSaved && <span className="text-xs text-primary">Saved</span>}
                {inviteTemplateError && <span className="max-w-72 text-xs text-red-400">{inviteTemplateError}</span>}
                <button
                  type="button"
                  onClick={handleSaveInviteTemplate}
                  disabled={inviteTemplateSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-primary-light disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  {inviteTemplateSaving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <label className="mb-1.5 block text-xs text-neutral-500">Subject</label>
                <input
                  type="text"
                  value={inviteEmailSubject}
                  onChange={(e) => {
                    setInviteEmailSubject(e.target.value);
                    setInviteTemplateSaved(false);
                  }}
                  maxLength={160}
                  className="w-full rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-neutral-500">Message Body</label>
                <textarea
                  value={inviteEmailBody}
                  onChange={(e) => {
                    setInviteEmailBody(e.target.value);
                    setInviteTemplateSaved(false);
                  }}
                  rows={13}
                  maxLength={5000}
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-sm leading-6 text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">Merge Fields</p>
                <div className="flex flex-wrap gap-2">
                  {INVITE_EMAIL_MERGE_FIELDS.map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        setInviteEmailBody((body) => `${body}${body.endsWith('\n') || body.length === 0 ? '' : '\n'}${field}`);
                        setInviteTemplateSaved(false);
                      }}
                      className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-mono text-neutral-400 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {field}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {canManageChallenge && activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-surface p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Challenge Settings</p>
              <p className="mt-0.5 text-xs text-neutral-500">Edit the candidate-facing brief and internal role metadata.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {settingsSaved && <span className="text-xs text-primary">Saved!</span>}
              {settingsError && <span className="max-w-72 text-xs text-red-400">{settingsError}</span>}
              <button
                type="submit"
                disabled={settingsSaving}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-primary-light disabled:opacity-50"
              >
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/5 bg-surface p-5">
                <p className="mb-4 text-sm font-medium text-white">Brief</p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-500">Title</label>
                    <input
                      type="text"
                      value={settingsForm.title}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, title: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-500">Cohort Label</label>
                    <input
                      type="text"
                      value={settingsForm.cohortLabel}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, cohortLabel: e.target.value }))}
                      placeholder="Campus 2026, Backend Drive May..."
                      maxLength={80}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all placeholder:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="mt-2 text-xs text-neutral-600">Optional label for grouping old assessments.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-500">Description</label>
                    <textarea
                      value={settingsForm.description}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, description: e.target.value }))}
                      rows={14}
                      className="w-full resize-y rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm leading-6 text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-surface p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Starter Files</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {starterFileCount > 0 ? `${starterFileCount} file${starterFileCount !== 1 ? 's' : ''} configured` : 'No starter files configured'}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/challenges/${challenge.id}/starter-files`}
                    className="rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-white/10"
                  >
                    Open Editor
                  </Link>
                </div>
                {hasStarterFileChanges && <p className="text-xs text-amber-300">Starter files have unsaved changes in the Starter Files tab.</p>}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-white/5 bg-surface p-5">
                <p className="mb-4 text-sm font-medium text-white">Timing</p>
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-500">Time Limit</label>
                  <input
                    type="number"
                    min={10}
                    max={45}
                    value={settingsForm.timeLimitMin}
                    onChange={(e) => setSettingsForm((form) => ({ ...form, timeLimitMin: e.target.value }))}
                    disabled={hasStartedSession}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                  {hasStartedSession && (
                    <p className="mt-2 text-xs text-neutral-500">Locked because at least one candidate has started.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-surface p-5">
                <p className="mb-4 text-sm font-medium text-white">Role Metadata</p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs text-neutral-500">Role</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {roleOptions.map((option) => {
                        const selected = settingsForm.role === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSettingsForm((form) => ({ ...form, role: option.id }))}
                            className={`rounded-xl border px-3 py-3 text-left transition-all ${selected
                                ? 'border-primary/50 bg-primary/10 text-primary'
                                : 'border-white/10 bg-[#0a0a0a] text-neutral-400 hover:border-white/20 hover:text-white'
                              }`}
                          >
                            <span className="block text-sm font-medium">{option.name}</span>
                            <span className="mt-0.5 block text-xs opacity-70">{option.description}</span>
                          </button>
                        );
                      })}
                    </div>
                    {hasCustomRole && (
                      <p className="mt-2 text-xs text-amber-300">Current saved role: {settingsForm.role}</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-neutral-500">Tech Stack</label>
                    {settingsForm.techStack.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {settingsForm.techStack.map((tech) => (
                          <span
                            key={tech}
                            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm text-primary"
                          >
                            {tech}
                            <button
                              type="button"
                              onClick={() => removeSettingsTech(tech)}
                              className="text-primary/60 transition-colors hover:text-white"
                              aria-label={`Remove ${tech}`}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mb-3 flex flex-wrap gap-2">
                      {uniqueTechSuggestions
                        .filter((tech) => !settingsForm.techStack.includes(tech))
                        .slice(0, 14)
                        .map((tech) => (
                          <button
                            key={tech}
                            type="button"
                            onClick={() => addSettingsTech(tech)}
                            className="rounded-full border border-white/10 bg-[#0a0a0a] px-3 py-1.5 text-sm text-neutral-400 transition-all hover:border-primary/30 hover:text-white"
                          >
                            + {tech}
                          </button>
                        ))}
                    </div>
                    <input
                      type="text"
                      value={settingsCustomTech}
                      onChange={(e) => setSettingsCustomTech(e.target.value)}
                      onKeyDown={handleSettingsCustomTechKeyDown}
                      onBlur={() => {
                        addSettingsTech(settingsCustomTech);
                        setSettingsCustomTech('');
                      }}
                      placeholder="Type a technology and press Enter..."
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-500">Seniority</label>
                    <select
                      value={settingsForm.seniority}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, seniority: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Not set</option>
                      {seniorityOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                      {hasCustomSeniority && <option value={settingsForm.seniority}>{settingsForm.seniority}</option>}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Focus Areas</label>
                    <p className="mb-3 text-xs text-neutral-600">Select up to 4 skills this challenge should emphasize.</p>
                    {customFocusAreas.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {customFocusAreas.map((area) => (
                          <span
                            key={area}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300"
                          >
                            {area}
                            <button
                              type="button"
                              onClick={() => toggleSettingsFocusArea(area)}
                              className="text-amber-300/60 transition-colors hover:text-white"
                              aria-label={`Remove ${area}`}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {focusOptions.map((option) => {
                        const selected = settingsForm.focusAreas.includes(option.value);
                        const disabled = !selected && settingsForm.focusAreas.length >= 4;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleSettingsFocusArea(option.value)}
                            disabled={disabled}
                            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${selected
                                ? 'border-primary/50 bg-primary/10 text-primary'
                                : 'border-white/10 bg-[#0a0a0a] text-neutral-400 hover:border-white/20 hover:text-neutral-300'
                              } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-500">Context</label>
                    <textarea
                      value={settingsForm.context}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, context: e.target.value }))}
                      rows={5}
                      className="w-full resize-y rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm leading-6 text-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-8">
          <div className="flex flex-col gap-4 border-b border-white/5 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Assessment Analytics</h2>
              <p className="mt-1 max-w-3xl text-sm text-neutral-500">
                Funnel, scoring, recommendations, and utilization for this assessment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fetchChallengeAnalytics}
                disabled={analyticsLoading}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {analyticsLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <a
                href={`/api/challenges/${challenge.id}/scores.csv`}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export candidate table
              </a>
            </div>
          </div>

          {analyticsError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {analyticsError}
            </div>
          )}

          {analyticsLoading && !analytics ? (
            <div className="flex items-center gap-3 text-sm text-neutral-500">
              <ArcSpinner label="Loading analytics" sizeClassName="h-4 w-4" />
              Loading analytics...
            </div>
          ) : analytics ? (
            <>
              <div className="grid gap-5 border-b border-white/5 pb-6 sm:grid-cols-2 lg:grid-cols-4">
                <AnalyticsMetric label="Invited" value={analytics.totalSessions} detail={`${analytics.pendingCount} pending`} />
                <AnalyticsMetric label="Started" value={analytics.startedCount} detail={formatAnalyticsPercent(analytics.funnel.find((item) => item.label === 'Started')?.percent)} />
                <AnalyticsMetric label="Average Score" value={analytics.averageScore ?? 'N/A'} detail={`${analytics.analyzedCount} analyzed`} />
                <AnalyticsMetric label="Avg. Duration" value={formatDurationMinutes(analytics.averageDurationMinutes)} detail={`${analytics.completedCount} completed`} />
              </div>

              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                <section>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">Completion Funnel</h3>
                    <span className="text-xs text-neutral-600">{analytics.activeCount} active now</span>
                  </div>
                  <AnalyticsRows items={analytics.funnel} total={analytics.totalSessions} />
                </section>

                <section>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white">Assessment Window</h3>
                    <p className="mt-1 text-xs text-neutral-600">
                      {analytics.accessWindow.status === 'not_set'
                        ? 'No start or end window set'
                        : analytics.accessWindow.status === 'not_started'
                          ? 'Window has not opened yet'
                          : analytics.accessWindow.status === 'ended'
                            ? 'Window has ended'
                            : 'Window is open'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="text-neutral-300">Capacity used</span>
                        <span className="text-neutral-500">
                          {analytics.capacity.used}{analytics.capacity.limit == null ? '' : ` / ${analytics.capacity.limit}`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Math.max(0, analytics.capacity.percent ?? 0))}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="text-neutral-300">Window elapsed</span>
                        <span className="text-neutral-500">{formatAnalyticsPercent(analytics.accessWindow.elapsedPercent)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-neutral-500"
                          style={{ width: `${Math.min(100, Math.max(0, analytics.accessWindow.elapsedPercent ?? 0))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                <section>
                  <h3 className="mb-4 text-sm font-semibold text-white">Score Distribution</h3>
                  <AnalyticsRows items={analytics.scoreBands} total={analytics.analyzedCount} />
                </section>
                <section>
                  <h3 className="mb-4 text-sm font-semibold text-white">Recommendation Breakdown</h3>
                  <AnalyticsRows items={analytics.recommendationDistribution} total={analytics.analyzedCount} />
                </section>
                <section>
                  <h3 className="mb-4 text-sm font-semibold text-white">Recruiter Decisions</h3>
                  <AnalyticsRows items={analytics.decisionDistribution} total={analytics.totalSessions} emptyLabel="No decisions saved yet" />
                </section>
              </div>

              <div className="grid gap-4 border-t border-white/5 pt-6 sm:grid-cols-2 lg:grid-cols-4">
                <AnalyticsMetric label="No-shows" value={analytics.lifecycleCounts.noShow} />
                <AnalyticsMetric label="Withdrawn" value={analytics.lifecycleCounts.withdrawn} />
                <AnalyticsMetric label="Disqualified" value={analytics.lifecycleCounts.disqualified} />
                <AnalyticsMetric label="Revoked" value={analytics.lifecycleCounts.revoked} />
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-600">Analytics will appear once candidate activity is available.</p>
          )}
        </div>
      )}

      {activeTab === 'candidates' && (
        <div>
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-white">Candidates ({challenge.sessions.length})</h2>
              <p className="max-w-3xl text-sm text-neutral-500">
                Unstarted candidates marked revoked, no-show, withdrawn, or disqualified do not count against assessment usage or capacity. Started sessions still count.
              </p>
              <p className="text-sm text-primary">Click a candidate row to view actions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openCandidateColumnsModal}
                className="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Columns
              </button>
              <a
                href={`/api/challenges/${challenge.id}/scores.csv`}
                className="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export scores CSV
              </a>
            </div>
          </div>
          {challenge.sessions.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-surface p-8 text-center">
              <p className="text-neutral-600">No candidates invited yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/5 bg-surface px-4 py-3">
                {selectedCandidate ? (
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{selectedCandidate.candidate_name}</p>
                      <p className="truncate text-xs text-neutral-500">{selectedCandidate.candidate_email}</p>
                      {lifecycleMessage?.sessionId === selectedCandidate.id && (
                        <p className={`mt-1 text-xs ${lifecycleMessage.tone === 'error' ? 'text-red-300' : 'text-primary'}`}>
                          {lifecycleMessage.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedVisibleStatus === 'analyzed' && (
                        <Link
                          href={`/dashboard/challenges/${challenge.id}/submissions/${selectedCandidate.id}`}
                          className={selectedActionButtonClass}
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                          View Report
                        </Link>
                      )}
                      {canManageChallenge && (selectedVisibleStatus === 'completed' || selectedAnalyzeBusy) && (
                        <button
                          type="button"
                          disabled={selectedAnalyzeBusy}
                          onClick={() => handleAnalyze(selectedCandidate.id)}
                          className={selectedActionButtonClass}
                        >
                          {selectedAnalyzeBusy ? (
                            <>
                              <ArcSpinner label="Analyzing session" sizeClassName="h-4 w-4" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                              Analyze
                            </>
                          )}
                        </button>
                      )}
                      {selectedCanUsePendingActions && (
                        <button
                          type="button"
                          disabled={selectedSendBusy}
                          onClick={() => handleLifecycleAction(selectedCandidate, 'send_invite_email')}
                          className={selectedActionButtonClass}
                        >
                          {selectedSendBusy ? (
                            <>
                              <ArcSpinner label="Sending invite email" sizeClassName="h-4 w-4" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4" aria-hidden="true" />
                              Send invite email
                            </>
                          )}
                        </button>
                      )}
                      {selectedCanCopyInviteLink && (
                        <button
                          type="button"
                          disabled={selectedCopyBusy}
                          onClick={() => void copySessionLink(selectedCandidate)}
                          className={selectedActionButtonClass}
                        >
                          {selectedCopyBusy ? (
                            <>
                              <ArcSpinner label="Copying invite link" sizeClassName="h-4 w-4" />
                              Copying...
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" aria-hidden="true" />
                              {copiedSessionId === selectedCandidate.id ? 'Copied invite link' : 'Copy invite link'}
                            </>
                          )}
                        </button>
                      )}
                      {selectedCanUsePendingActions && (
                        <>
                          <button
                            type="button"
                            disabled={selectedRegenerateBusy}
                            onClick={() => handleLifecycleAction(selectedCandidate, 'regenerate_link')}
                            className={selectedActionButtonClass}
                          >
                            {selectedRegenerateBusy ? (
                              <>
                                <ArcSpinner label="Regenerating invite link" sizeClassName="h-4 w-4" />
                                Regenerating...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Regenerate invite link
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={selectedRevokeBusy}
                            onClick={() => handleLifecycleAction(selectedCandidate, 'revoke')}
                            className={selectedActionButtonClass}
                          >
                            {selectedRevokeBusy ? (
                              <>
                                <ArcSpinner label="Revoking invite" sizeClassName="h-4 w-4" />
                                Revoking...
                              </>
                            ) : (
                              <>
                                <UserX className="h-4 w-4" aria-hidden="true" />
                                Revoke unused invite
                              </>
                            )}
                          </button>
                        </>
                      )}
                      {selectedCanMarkNoShow && selectedCandidateStatus !== 'no_show' && (
                        <button
                          type="button"
                          disabled={selectedNoShowBusy}
                          onClick={() => handleLifecycleSelect(selectedCandidate, 'mark_no_show')}
                          className={selectedActionButtonClass}
                        >
                          {selectedNoShowBusy ? (
                            <>
                              <ArcSpinner label="Marking no-show" sizeClassName="h-4 w-4" />
                              Marking...
                            </>
                          ) : (
                            <>
                              <UserMinus className="h-4 w-4" aria-hidden="true" />
                              Mark no-show
                            </>
                          )}
                        </button>
                      )}
                      {canManageChallenge && selectedCandidateStatus !== 'withdrawn' && (
                        <button
                          type="button"
                          disabled={selectedWithdrawnBusy}
                          onClick={() => setLifecycleConfirmAction('mark_withdrawn')}
                          className={selectedActionButtonClass}
                        >
                          {selectedWithdrawnBusy ? (
                            <>
                              <ArcSpinner label="Marking withdrawn" sizeClassName="h-4 w-4" />
                              Marking...
                            </>
                          ) : (
                            <>
                              <Ban className="h-4 w-4" aria-hidden="true" />
                              Mark withdrawn
                            </>
                          )}
                        </button>
                      )}
                      {canManageChallenge && selectedCandidateStatus !== 'disqualified' && (
                        <button
                          type="button"
                          disabled={selectedDisqualifiedBusy}
                          onClick={() => setLifecycleConfirmAction('mark_disqualified')}
                          className={selectedActionButtonClass}
                        >
                          {selectedDisqualifiedBusy ? (
                            <>
                              <ArcSpinner label="Marking disqualified" sizeClassName="h-4 w-4" />
                              Marking...
                            </>
                          ) : (
                            <>
                              <UserX className="h-4 w-4" aria-hidden="true" />
                              Mark disqualified
                            </>
                          )}
                        </button>
                      )}
                      {canManageChallenge && selectedCandidate.candidate_lifecycle_status && (
                        <button
                          type="button"
                          disabled={selectedClearBusy}
                          onClick={() => handleLifecycleSelect(selectedCandidate, 'clear_lifecycle')}
                          className={selectedActionButtonClass}
                        >
                          {selectedClearBusy ? (
                            <>
                              <ArcSpinner label="Clearing status" sizeClassName="h-4 w-4" />
                              Clearing...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                              Clear candidate status
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">Select one candidate to show available actions.</p>
                )}
              </div>

              <div className="block w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-white/5 bg-surface">
                <table className="w-max min-w-full border-collapse text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs uppercase tracking-[0.18em] text-neutral-600">
                    {candidateColumnVisible('candidate') && <th className="px-5 py-3 font-medium">Candidate</th>}
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
                  {challenge.sessions.map((session) => {
                    const isStartingAnalysis = analysisStartingIds.has(session.id);
                    const visibleStatus = isStartingAnalysis ? 'queued' : session.status;
                    const analysisAlertLabel = getAnalysisAlertLabel(session);
                    const isSelected = selectedCandidateId === session.id;

                    return (
                      <tr
                        key={session.id}
                        id={`candidate-row-${session.id}`}
                        onClick={() => setSelectedCandidateId((current) => current === session.id ? null : session.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedCandidateId((current) => current === session.id ? null : session.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        className={`cursor-pointer border-b border-white/5 transition-colors last:border-0 ${isSelected ? 'bg-primary/8' : 'hover:bg-white/3'}`}
                        aria-pressed={isSelected}
                        aria-label={`Select ${session.candidate_name}`}
                      >
                        {candidateColumnVisible('candidate') && (
                          <td className="px-5 py-4 font-medium text-white">{session.candidate_name}</td>
                        )}
                        {candidateColumnVisible('email') && (
                          <td className="px-5 py-4 text-neutral-500">{session.candidate_email}</td>
                        )}
                        {candidateColumnVisible('started') && (
                          <td className="px-5 py-4 text-neutral-600">{session.started_at ? formatDateTime(session.started_at) : 'Not started'}</td>
                        )}
                        {candidateColumnVisible('duration') && (
                          <td className="px-5 py-4 text-neutral-500">{getSessionDurationLabel(session)}</td>
                        )}
                        {candidateColumnVisible('sessionStatus') && (
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColors[visibleStatus]}`}>
                              {statusLabels[visibleStatus] ?? visibleStatus}
                            </span>
                            {analysisAlertLabel && (
                              <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                                {analysisAlertLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        )}
                        {candidateColumnVisible('candidateStatus') && (
                        <td className="px-5 py-4">
                          {session.candidate_lifecycle_status && (
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${lifecycleStatusColors[session.candidate_lifecycle_status]}`}>
                              {lifecycleStatusLabels[session.candidate_lifecycle_status]}
                            </span>
                          )}
                        </td>
                        )}
                        {candidateColumnVisible('decision') && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getDecisionColor(session.decision_label)}`}>
                              {getDecisionLabel(session.decision_label)}
                            </span>
                            {session.recruiter_notes?.trim() && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReviewPreviewSession(session);
                                }}
                                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
                                title="View reviewer notes"
                                aria-label="Reviewer notes saved"
                              >
                                <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                        )}
                        {candidateColumnVisible('inviteEmail') && (
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${inviteEmailStatusColors[session.invite_email_status || 'not_sent']}`}
                            >
                              {inviteEmailStatusLabels[session.invite_email_status || 'not_sent']}
                            </span>
                          </div>
                        </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

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
            aria-labelledby="candidate-columns-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
              <div>
                <p id="candidate-columns-title" className="text-sm font-semibold text-white">Table Columns</p>
                <p className="mt-1 text-xs text-neutral-500">Choose which candidate fields are shown.</p>
              </div>
              <button
                type="button"
                onClick={() => setCandidateColumnsOpen(false)}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close column selector"
              >
                &times;
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
              {candidateColumns.map((column) => {
                const checked = draftCandidateColumns.has(column.id);
                return (
                  <label
                    key={column.id}
                    className={`flex cursor-pointer items-start gap-3 border-b border-white/5 py-3 last:border-0 ${column.locked ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={column.locked}
                      onChange={() => toggleDraftCandidateColumn(column.id)}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">
                        {column.label}
                        {column.locked && <span className="ml-2 text-xs font-normal text-neutral-500">Required</span>}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-neutral-500">{column.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/5 px-5 py-4">
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

      <ConfirmationModal
        open={Boolean(modalMessage)}
        title={modalMessage?.title ?? ''}
        description={modalMessage?.description ?? ''}
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setModalMessage(null)}
        onClose={() => setModalMessage(null)}
      />

      <ConfirmationModal
        open={Boolean(lifecycleConfirmAction) && Boolean(selectedCandidate)}
        title={lifecycleConfirmAction === 'mark_withdrawn' ? 'Mark candidate as withdrawn?' : 'Mark candidate as disqualified?'}
        description={lifecycleConfirmDescription(selectedCandidate, lifecycleConfirmAction)}
        confirmLabel={lifecycleConfirmAction === 'mark_withdrawn' ? 'Mark Withdrawn' : 'Mark Disqualified'}
        cancelLabel="Cancel"
        variant="danger"
        isLoading={lifecycleConfirmAction === 'mark_withdrawn' ? selectedWithdrawnBusy : selectedDisqualifiedBusy}
        onConfirm={() => void confirmLifecycleAction()}
        onClose={() => setLifecycleConfirmAction(null)}
      />

      {reviewPreviewSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewPreviewSession(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-preview-title"
            className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl lg:w-[25vw] lg:min-w-90"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
              <div className="min-w-0">
                <p id="review-preview-title" className="text-sm font-semibold text-white">
                  Recruiter Review
                </p>
                <p className="mt-1 break-all text-xs text-neutral-500">
                  {reviewPreviewSession.candidate_name} - {reviewPreviewSession.candidate_email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewPreviewSession(null)}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close recruiter review"
              >
                &times;
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">Decision</p>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getDecisionColor(reviewPreviewSession.decision_label)}`}>
                  {getDecisionLabel(reviewPreviewSession.decision_label)}
                </span>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">Private Notes</p>
                <p className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/25 px-4 py-3 text-sm leading-6 text-neutral-300">
                  {reviewPreviewSession.recruiter_notes?.trim() || 'No notes saved.'}
                </p>
              </div>

              {reviewPreviewSession.reviewed_at && (
                <p className="mt-4 text-xs text-neutral-600">
                  Last saved by {reviewPreviewSession.reviewed_by_name || reviewPreviewSession.reviewed_by_email || 'reviewer'} on {formatDateTime(reviewPreviewSession.reviewed_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {canManageChallenge && (
        <>
          <ConfirmationModal
            open={closeAccessModalOpen}
            title="Close Assessment?"
            description="Closing blocks new candidate registration, recruiter invite generation, and pending candidates from starting. Active sessions are not ended automatically, and completed reports remain available."
            confirmLabel="Stage Close"
            cancelLabel="Keep Open"
            variant="danger"
            onConfirm={() => {
              setAccessIsActive(false);
              setAccessSaved(false);
              setCloseAccessModalOpen(false);
            }}
            onClose={() => setCloseAccessModalOpen(false)}
          />

          <ConfirmationModal
            open={archiveModalOpen}
            title={challenge.archived_at ? 'Unarchive Assessment?' : 'Archive Assessment?'}
            description={
              challenge.archived_at
                ? `"${challenge.title}" will return to the dashboard according to its current access state.`
                : Boolean(challenge.is_active)
                  ? `"${challenge.title}" may still accept candidates. Archiving only hides it from the main dashboard unless you close it too.`
                  : `"${challenge.title}" will move out of the main dashboard. Candidate history and reports stay preserved.`
            }
            confirmLabel={challenge.archived_at ? 'Unarchive' : 'Archive Only'}
            cancelLabel="Cancel"
            onConfirm={() => handleArchiveChallenge(false)}
            onClose={() => setArchiveModalOpen(false)}
            secondaryAction={
              !challenge.archived_at && Boolean(challenge.is_active)
                ? {
                  label: 'Close and Archive',
                  onClick: () => handleArchiveChallenge(true),
                }
                : undefined
            }
          />

          <DuplicateChallengeModal
            open={duplicateModalOpen}
            source={{
              id: challenge.id,
              title: challenge.title,
              hasStarterFiles: starterFileCount > 0,
              hasAllowedEmails: Boolean(challenge.allowed_emails?.length),
              hasAccessWindow: Boolean(challenge.starts_at || challenge.ends_at),
              hasCohortLabel: Boolean(challenge.cohort_label),
            }}
            onClose={() => setDuplicateModalOpen(false)}
            onDuplicated={(duplicatedChallengeId) => {
              setDuplicateModalOpen(false);
              router.push(`/dashboard/challenges/${duplicatedChallengeId}`);
            }}
          />
        </>
      )}
    </div>
  );
}
