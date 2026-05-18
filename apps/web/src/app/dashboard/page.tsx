'use client';

import ChallengeCard from '@/components/dashboard/ChallengeCard';
import ConcentricArcLoader from '@/components/dashboard/ConcentricArcLoader';
import ConfirmationModal from '@/components/ConfirmationModal';
import DuplicateChallengeModal from '@/components/dashboard/DuplicateChallengeModal';
import AnalysisAlertsPanel from '@/components/dashboard/AnalysisAlertsPanel';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ChallengeWithCount {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  is_active: boolean | number;
  ends_at: string | null;
  archived_at: string | null;
  cohort_label: string | null;
  has_starter_files: boolean;
  has_allowed_emails: boolean;
  has_access_window: boolean;
  created_at: string;
  candidate_count: number;
}

type DuplicateSource = {
  id: string;
  title: string;
  hasStarterFiles: boolean;
  hasAllowedEmails: boolean;
  hasAccessWindow: boolean;
  hasCohortLabel: boolean;
};

type ChallengeView = 'active' | 'closed' | 'archived' | 'all';

const challengeViews: { id: ChallengeView; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'closed', label: 'Closed' },
  { id: 'archived', label: 'Archived' },
  { id: 'all', label: 'All' },
];

const emptyStateCopy: Record<ChallengeView, { title: string; action: string }> = {
  active: { title: 'No active assessments', action: 'Create a new assessment' },
  closed: { title: 'No closed assessments', action: 'View active assessments' },
  archived: { title: 'No archived assessments', action: 'View active assessments' },
  all: { title: 'No challenges yet', action: 'Create your first challenge' },
};

function TrialBanner() {
  const { planStatus } = useSubscription();
  const { user } = useAuth();
  const [now] = useState(() => Date.now());

  if (!planStatus || user?.isAdmin) return null;

  // Active trial banner
  if (planStatus.plan === 'trial' && planStatus.canCreateSession && planStatus.trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(planStatus.trialEndsAt).getTime() - now) / (1000 * 60 * 60 * 24))
    );
    const isUrgent = daysLeft <= 3;

    return (
      <div
        className={`border rounded-xl p-4 mb-6 ${
          isUrgent
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-primary/20 bg-primary/5'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              className={`text-sm font-semibold ${
                isUrgent ? 'text-amber-300' : 'text-primary'
              }`}
            >
              {isUrgent
                ? `Only ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in your free trial`
                : `Free trial — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Your 14-day trial started when your account was created.{' '}
              You have used {planStatus.sessionsUsed} of {planStatus.sessionsLimit} assessments.
            </p>
          </div>
          {planStatus.paymentUrl && (
            <a
              href={planStatus.paymentUrl}
              className="bg-primary hover:bg-primary/90 text-black text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              Upgrade Plan
            </a>
          )}
        </div>
      </div>
    );
  }

  // Blocked banners (trial expired, quota exceeded, not enrolled)
  if (!planStatus.canCreateSession) {
    const bannerConfig: Record<string, { title: string; message: string; color: string; textColor: string }> = {
      trial_expired: {
        title: 'Your 14-day free trial has ended',
        message: 'Your trial began when your account was created and has now expired. Subscribe to continue creating assessments.',
        color: 'border-amber-500/30 bg-amber-500/5',
        textColor: 'text-amber-300',
      },
      quota_exceeded: {
        title: `You've used all ${planStatus.sessionsLimit} assessments`,
        message: planStatus.plan === 'trial'
          ? 'You have reached the trial assessment limit. Upgrade your plan to continue.'
          : 'Upgrade your plan to continue.',
        color: 'border-red-500/30 bg-red-500/5',
        textColor: 'text-red-300',
      },
      subscription_lapsed: {
        title: 'Your subscription has expired',
        message: `You've used ${planStatus.sessionsUsed} of ${planStatus.sessionsLimit} assessments this period. Renew to continue creating new ones.`,
        color: 'border-red-500/30 bg-red-500/5',
        textColor: 'text-red-300',
      },
      not_enrolled: {
        title: 'Subscription required',
        message: 'Subscribe to start creating assessments.',
        color: 'border-amber-500/30 bg-amber-500/5',
        textColor: 'text-amber-300',
      },
    };

    const config = bannerConfig[planStatus.reason];
    if (!config) return null;

    return (
      <div className={`border rounded-xl p-4 mb-6 ${config.color}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-sm font-semibold ${config.textColor}`}>{config.title}</h3>
            <p className="text-xs text-neutral-400 mt-0.5">{config.message}</p>
          </div>
          {planStatus.paymentUrl && (
            <a
              href={planStatus.paymentUrl}
              className="bg-primary hover:bg-primary/90 text-black text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              Upgrade Plan
            </a>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ChallengeView>('active');
  const [archiveTarget, setArchiveTarget] = useState<{
    id: string;
    title: string;
    isActive: boolean;
    isArchived: boolean;
  } | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<DuplicateSource | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user?.isAdmin && !user.companyId) {
      router.replace('/dashboard/admin');
      return;
    }

    let cancelled = false;

    setLoading(true);
    fetch(`/api/challenges?view=${view}`)
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(data)) {
          throw new Error(data?.error || 'Failed to load challenges');
        }
        if (!cancelled) setChallenges(data);
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user, view]);

  async function handleArchiveConfirm(close = false) {
    if (!archiveTarget || archiveSaving) return;

    setArchiveSaving(true);
    setArchiveError(null);
    try {
      const res = await fetch(`/api/challenges/${archiveTarget.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archived: !archiveTarget.isArchived,
          close,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to update assessment archive state');
      }

      setChallenges((current) =>
        view === 'all'
          ? current.map((challenge) => challenge.id === archiveTarget.id ? { ...challenge, ...data } : challenge)
          : current.filter((challenge) => challenge.id !== archiveTarget.id)
      );
      setArchiveTarget(null);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Failed to update assessment archive state');
    } finally {
      setArchiveSaving(false);
    }
  }

  const emptyCopy = emptyStateCopy[view];

  return (
    <div>
      <TrialBanner />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-serif italic text-white">Challenges</h1>
          <p className="text-neutral-500 mt-1">Manage your AI-collaboration assessments</p>
        </div>
        <Link
          href="/dashboard/challenges/new"
          className="bg-primary hover:bg-primary-light text-black px-5 py-2.5 rounded-xl text-sm font-semibold transition-all btn-glow"
        >
          New Challenge
        </Link>
      </div>

      <AnalysisAlertsPanel />

      <div className="mb-6 overflow-x-auto border-b border-white/10" role="tablist" aria-label="Challenge status">
        <div className="flex min-w-max gap-8 sm:gap-12">
          {challengeViews.map((challengeView) => {
            const isActive = view === challengeView.id;
            return (
              <button
                key={challengeView.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setView(challengeView.id)}
                disabled={loading}
                className={`border-b-2 px-3 py-3 text-sm font-semibold transition-colors sm:px-4 ${
                  isActive
                    ? 'border-primary text-white'
                    : 'border-transparent text-neutral-600 hover:text-neutral-300 disabled:hover:text-neutral-600'
                }`}
              >
                {challengeView.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <ConcentricArcLoader />
      ) : challenges.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-neutral-600 text-lg mb-4">{emptyCopy.title}</p>
          <Link
            href={view === 'active' || view === 'all' ? '/dashboard/challenges/new' : '#'}
            onClick={(event) => {
              if (view === 'closed' || view === 'archived') {
                event.preventDefault();
                setView('active');
              }
            }}
            className="text-primary hover:text-primary-light text-sm"
          >
            {emptyCopy.action}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              {...challenge}
              onArchiveToggle={(target) => {
                setArchiveError(null);
                setArchiveTarget(target);
              }}
              onDuplicate={setDuplicateSource}
            />
          ))}
        </div>
      )}

      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title={archiveTarget?.isArchived ? 'Unarchive Assessment?' : 'Archive Assessment?'}
        description={
          archiveTarget?.isArchived
            ? `"${archiveTarget.title}" will return to the dashboard according to its current access state.`
            : archiveTarget?.isActive
              ? `"${archiveTarget?.title}" may still accept candidates. Archiving only hides it from this list unless you close it too.`
              : `"${archiveTarget?.title}" will move out of the main dashboard. Candidate history and reports stay preserved.`
        }
        confirmLabel={archiveTarget?.isArchived ? 'Unarchive' : 'Archive Only'}
        cancelLabel="Cancel"
        isLoading={archiveSaving}
        error={archiveError}
        onConfirm={() => handleArchiveConfirm(false)}
        onClose={() => {
          setArchiveTarget(null);
          setArchiveError(null);
        }}
        secondaryAction={
          archiveTarget && !archiveTarget.isArchived && archiveTarget.isActive
            ? {
                label: 'Close and Archive',
                onClick: () => handleArchiveConfirm(true),
              }
            : undefined
          }
      />
      <DuplicateChallengeModal
        open={Boolean(duplicateSource)}
        source={duplicateSource}
        onClose={() => setDuplicateSource(null)}
        onDuplicated={(challengeId) => {
          setDuplicateSource(null);
          router.push(`/dashboard/challenges/${challengeId}`);
        }}
      />
    </div>
  );
}
