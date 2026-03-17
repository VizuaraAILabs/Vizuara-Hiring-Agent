'use client';

import ChallengeCard from '@/components/dashboard/ChallengeCard';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ChallengeWithCount {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  is_active: number;
  created_at: string;
  candidate_count: number;
}

function TrialBanner() {
  const { planStatus } = useSubscription();
  const { user } = useAuth();

  if (!planStatus || user?.isAdmin) return null;

  // Active trial banner
  if (planStatus.plan === 'trial' && planStatus.canCreateSession && planStatus.trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(planStatus.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
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
  const [challenges, setChallenges] = useState<ChallengeWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/challenges')
      .then((res) => res.json())
      .then((data) => setChallenges(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-6 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-2/3 mb-3" />
              <div className="h-4 bg-white/5 rounded w-full mb-2" />
              <div className="h-4 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-neutral-600 text-lg mb-4">No challenges yet</p>
          <Link
            href="/dashboard/challenges/new"
            className="text-primary hover:text-primary-light text-sm"
          >
            Create your first challenge
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} {...challenge} />
          ))}
        </div>
      )}
    </div>
  );
}
