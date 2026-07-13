'use client';

import FPLLogo from '@/components/FPLLogo';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { label: 'Challenges', href: '/dashboard', icon: '{}', companyOnly: true },
  { label: 'Assessments', href: '/dashboard/assessments', icon: '[]', companyOnly: true },
  { label: 'New Challenge', href: '/dashboard/challenges/new', icon: '+', companyOnly: true, writeOnly: true },
  { label: 'Company Profile', href: '/dashboard/profile', icon: '○', companyOnly: true, roles: ['owner'] },
  { label: 'Team', href: '/dashboard/team', icon: 'TM', companyOnly: true, roles: ['owner', 'recruiter'] },
  { label: 'Costs', href: '/dashboard/costs', icon: '$', adminOnly: true, companyOnly: true },
  { label: 'Companies', href: '/dashboard/admin', icon: 'CO', adminOnly: true },
  { label: 'All Challenges', href: '/dashboard/admin/challenges', icon: '{}', adminOnly: true },
  { label: 'Outbound', href: '/dashboard/admin/outbound', icon: 'OB', adminOnly: true },
  { label: 'Usage & Costs', href: '/dashboard/admin/costs', icon: '$', adminOnly: true },
  { label: 'Feedback', href: '/dashboard/admin/feedback', icon: '!', adminOnly: true },
];

const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

const periodDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatPeriodDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return periodDateFormatter.format(date);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { planStatus } = useSubscription();
  const [now] = useState(() => Date.now());
  
  const planLabel = planStatus ? (PLAN_LABELS[planStatus.plan] || planStatus.plan) : null;
  const isUnlimited = planStatus?.sessionsLimit === -1;
  const usagePercent = planStatus && !isUnlimited && planStatus.sessionsLimit > 0
    ? Math.min(100, (planStatus.sessionsUsed / planStatus.sessionsLimit) * 100)
    : 0;
  const isBlocked = planStatus && !planStatus.canCreateSession;

  const trialDaysLeft = planStatus?.plan === 'trial' && planStatus.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(planStatus.trialEndsAt).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;
  const periodStart = formatPeriodDate(planStatus?.currentPeriodStart);
  const periodEnd = formatPeriodDate(planStatus?.currentPeriodEnd);
  const periodLabel = periodStart && periodEnd
    ? `${periodStart} - ${periodEnd}`
    : periodStart
      ? `From ${periodStart}`
      : periodEnd
        ? `Until ${periodEnd}`
        : null;

  return (
    <aside className="print:hidden w-64 bg-surface border-r border-white/5 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-white/5">
        <Link href="/" className="flex items-center gap-2.5">
          <FPLLogo size={26} />
          <span className="text-lg font-semibold text-white">
            Arc<span className="text-primary">Eval</span>
          </span>
        </Link>
        <p className="text-xs text-neutral-600 mt-1">By First Principle Labs</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || user?.isAdmin)
          .filter((item) => !item.companyOnly || Boolean(user?.companyId))
          .filter((item) => !item.writeOnly || user?.role === 'owner' || user?.role === 'recruiter')
          .filter((item) => !item.roles || (user?.role && item.roles.includes(user.role)))
          .map((item) => {
            const isActive = item.href === '/dashboard' || item.href === '/dashboard/admin'
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                  }`}
              >
                <span className="text-lg font-mono">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
      </nav>

      {/* Plan status section — hidden for admins */}
      {planStatus && !user?.isAdmin && (
        <div className="px-4 pb-2">
          <div className="bg-white/3 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                {planLabel}
              </span>
              {planStatus.plan === 'trial' && trialDaysLeft !== null && (
                <span
                  className={`text-xs ${trialDaysLeft <= 3 ? 'text-amber-400' : 'text-neutral-500'}`}
                  title="Your 14-day trial started when your account was created"
                >
                  {trialDaysLeft}d left
                </span>
              )}
              {planStatus.reason === 'subscription_lapsed' && (
                <span className="text-xs text-red-400 font-medium" title="Your subscription has expired">
                  Expired
                </span>
              )}
            </div>

            {isBlocked ? (
              <>
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                  <p className="text-sm font-medium text-red-200">
                    {planStatus.reason === 'subscription_lapsed'
                      ? 'Subscription inactive'
                      : 'Assessments paused'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-red-200/70">
                    {planStatus.reason === 'subscription_lapsed'
                      ? 'Renew to continue creating assessments.'
                      : 'Upgrade to continue creating assessments.'}
                  </p>
                </div>
                {periodLabel && (
                  <div className="mt-3 border-t border-white/5 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                      Period
                    </p>
                    <p className="mt-0.5 text-xs leading-4 text-neutral-400">
                      {periodLabel}
                    </p>
                  </div>
                )}
              </>
            ) : !isUnlimited ? (
              <>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm text-white font-medium">
                    {planStatus.sessionsUsed} / {planStatus.sessionsLimit}
                  </span>
                  <span className="text-xs text-neutral-500">assessments</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usagePercent >= 100
                        ? 'bg-red-500'
                        : usagePercent >= 80
                          ? 'bg-amber-400'
                          : 'bg-primary'
                      }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                {periodLabel && (
                  <div className="mt-3 border-t border-white/5 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                      Period
                    </p>
                    <p className="mt-0.5 text-xs leading-4 text-neutral-400">
                      {periodLabel}
                    </p>
                  </div>
                )}
              </>
            ) : null}

            {!isBlocked && isUnlimited && (
              <>
                <span className="text-sm text-neutral-400">
                  {planStatus.sessionsUsed} assessments used
                </span>
                {periodLabel && (
                  <div className="mt-3 border-t border-white/5 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                      Period
                    </p>
                    <p className="mt-0.5 text-xs leading-4 text-neutral-400">
                      {periodLabel}
                    </p>
                  </div>
                )}
              </>
            )}

            {isBlocked && planStatus.paymentUrl && (
              <a
                href={planStatus.paymentUrl}
                className="mt-3 block w-full text-center bg-primary hover:bg-primary/90 text-black text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                {planStatus.reason === 'subscription_lapsed' ? 'Renew Subscription' : 'Upgrade Plan'}
              </a>
            )}
          </div>
        </div>
      )}

      <div className="p-4 border-t border-white/5">
        <button
          onClick={logout}
          className="w-full text-left px-4 py-3 rounded-xl text-sm text-white bg-red-600 hover:bg-red-500 transition-all"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
