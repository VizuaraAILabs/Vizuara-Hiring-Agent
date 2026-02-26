'use client';

import FPLLogo from '@/components/FPLLogo';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Challenges', href: '/dashboard', icon: '{}' },
  { label: 'New Challenge', href: '/dashboard/challenges/new', icon: '+' },
  { label: 'Costs', href: '/dashboard/costs', icon: '$' },
];

const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

export default function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { planStatus } = useSubscription();

  const planLabel = planStatus ? (PLAN_LABELS[planStatus.plan] || planStatus.plan) : null;
  const isUnlimited = planStatus?.sessionsLimit === -1;
  const usagePercent = planStatus && !isUnlimited && planStatus.sessionsLimit > 0
    ? Math.min(100, (planStatus.sessionsUsed / planStatus.sessionsLimit) * 100)
    : 0;
  const isBlocked = planStatus && !planStatus.canCreateSession;

  const trialDaysLeft = planStatus?.plan === 'trial' && planStatus.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(planStatus.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <aside className="w-64 bg-[#111] border-r border-white/5 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <FPLLogo size={26} />
          <span className="text-lg font-semibold text-white">
            Arc<span className="text-primary">Eval</span>
          </span>
        </Link>
        <p className="text-xs text-neutral-600 mt-1">By First Principle Labs</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
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

      {/* Plan status section */}
      {planStatus && (
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
            </div>

            {!isUnlimited && (
              <>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm text-white font-medium">
                    {planStatus.sessionsUsed} / {planStatus.sessionsLimit}
                  </span>
                  <span className="text-xs text-neutral-500">assessments</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercent >= 100
                        ? 'bg-red-500'
                        : usagePercent >= 80
                          ? 'bg-amber-400'
                          : 'bg-primary'
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </>
            )}

            {isUnlimited && (
              <span className="text-sm text-neutral-400">
                {planStatus.sessionsUsed} assessments used
              </span>
            )}

            {isBlocked && planStatus.paymentUrl && (
              <a
                href={planStatus.paymentUrl}
                className="mt-3 block w-full text-center bg-primary hover:bg-primary/90 text-black text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Upgrade Plan
              </a>
            )}
          </div>
        </div>
      )}

      <div className="p-4 border-t border-white/5">
        <button
          onClick={logout}
          className="w-full text-left px-4 py-3 rounded-xl text-sm text-neutral-500 hover:text-white hover:bg-white/5 transition-all"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
