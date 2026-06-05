import sql from './db';
import { getAdminFirestore } from './firebase-admin';
import { PLAN_LIMITS, PLAN_TEAM_MEMBER_LIMITS } from './plan-limits';
import type { PlanTier, PlanStatus } from '@/types';

const ENROLLMENT_ID = process.env.ARCEVAL_ENROLLMENT_ID || '';
const PAYMENT_URL = process.env.ARCEVAL_PAYMENT_URL || '';
const PLAN_STATUS_URL =
  process.env.ARCEVAL_PLAN_STATUS_URL ||
  'https://us-central1-vizuara-ai-labs.cloudfunctions.net/getEffectivePlanForArcEval';

interface ActiveSubscription {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  plan: Exclude<PlanTier, 'trial'>;
}

interface LabsPlanResponse {
  isEnrolled?: boolean;
  plan?: unknown;
  currentPeriodStart?: unknown;
  currentPeriodEnd?: unknown;
}

/**
 * Core quota & enrollment checker.
 * Determines whether a company can create a new assessment session.
 */
export async function checkEnrollmentStatus(companyId: string): Promise<PlanStatus> {
  const paymentUrl = PAYMENT_URL;

  // 1. Fetch company record
  const [company] = await sql<{
    firebase_uid: string | null;
    plan: PlanTier;
    trial_ends_at: string | null;
    team_member_limit: number;
  }[]>`
    SELECT firebase_uid, plan, trial_ends_at, team_member_limit FROM companies WHERE id = ${companyId}
  `;

  if (!company) {
    return {
      canCreateSession: false,
      reason: 'not_enrolled',
      sessionsUsed: 0,
      sessionsLimit: 0,
      plan: 'trial',
      trialEndsAt: null,
      paymentUrl,
    };
  }

  const trialEndsAt = company.trial_ends_at;

  // 2. Trial plans: check for an active paid subscription, then fall through
  if (company.plan === 'trial') {
    if (company.firebase_uid) {
      const subscription = await readActiveSubscription(company.firebase_uid);
      if (subscription) {
        const newPlan = subscription.plan;
        await updateCompanyPaidPlan(companyId, newPlan);
        const sessionsUsed = await countSessionsSince(companyId, subscription.currentPeriodStart);
        return checkPaidPlan(newPlan, sessionsUsed, null, subscription);
      }
    }

    const sessionsUsed = await countSessionsSince(companyId, null);
    const trialExpired = trialEndsAt ? new Date(trialEndsAt) < new Date() : false;

    if (!trialExpired && sessionsUsed < PLAN_LIMITS.trial) {
      return {
        canCreateSession: true,
        reason: 'trial_active',
        sessionsUsed,
        sessionsLimit: PLAN_LIMITS.trial,
        plan: 'trial',
        trialEndsAt,
      };
    }

    if (!trialExpired && sessionsUsed >= PLAN_LIMITS.trial) {
      return {
        canCreateSession: false,
        reason: 'quota_exceeded',
        sessionsUsed,
        sessionsLimit: PLAN_LIMITS.trial,
        plan: 'trial',
        trialEndsAt,
        paymentUrl,
      };
    }

    return {
      canCreateSession: false,
      reason: 'trial_expired',
      sessionsUsed,
      sessionsLimit: PLAN_LIMITS.trial,
      plan: 'trial',
      trialEndsAt,
      paymentUrl,
    };
  }

  // 3. Paid plans: verify subscription is still active and use currentPeriodStart as the period anchor
  if (company.firebase_uid) {
    const subscription = await readActiveSubscription(company.firebase_uid);
    if (!subscription) {
      // Subscription lapsed — preserve their tier (so admin & sidebar agree, and renewal
      // restores access without a fresh trial-upgrade). Block new sessions, but still show
      // the actual usage against the actual plan limit.
      const sessionsUsed = await countSessionsSince(companyId, null);
      const limit = PLAN_LIMITS[company.plan];
      return {
        canCreateSession: false,
        reason: 'subscription_lapsed',
        sessionsUsed,
        sessionsLimit: limit === Infinity ? -1 : limit,
        plan: company.plan,
        trialEndsAt: null,
        paymentUrl,
      };
    }
    const sessionsUsed = await countSessionsSince(companyId, subscription.currentPeriodStart);
    if (subscription.plan !== company.plan || shouldUpdateTeamMemberLimit(subscription.plan, company.team_member_limit)) {
      await updateCompanyPaidPlan(companyId, subscription.plan);
    }
    return checkPaidPlan(subscription.plan, sessionsUsed, null, subscription);
  }

  const sessionsUsed = await countSessionsSince(companyId, null);
  return checkPaidPlan(company.plan, sessionsUsed, null);
}

function checkPaidPlan(
  plan: PlanTier,
  sessionsUsed: number,
  trialEndsAt: string | null,
  subscription?: Pick<ActiveSubscription, 'currentPeriodStart' | 'currentPeriodEnd'> | null
): PlanStatus {
  const limit = PLAN_LIMITS[plan];
  const paymentUrl = `${process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai'}/pricing`;
  const period = formatSubscriptionPeriod(subscription);

  if (sessionsUsed >= limit) {
    return {
      canCreateSession: false,
      reason: 'quota_exceeded',
      sessionsUsed,
      sessionsLimit: limit === Infinity ? -1 : limit,
      plan,
      trialEndsAt,
      ...period,
      paymentUrl,
    };
  }

  return {
    canCreateSession: true,
    reason: 'ok',
    sessionsUsed,
    sessionsLimit: limit === Infinity ? -1 : limit,
    plan,
    trialEndsAt,
    ...period,
  };
}

function shouldUpdateTeamMemberLimit(plan: Exclude<PlanTier, 'trial'>, currentLimit: number): boolean {
  const expectedLimit = PLAN_TEAM_MEMBER_LIMITS[plan];
  return expectedLimit !== undefined && currentLimit !== expectedLimit;
}

async function updateCompanyPaidPlan(companyId: string, plan: Exclude<PlanTier, 'trial'>): Promise<void> {
  const teamMemberLimit = PLAN_TEAM_MEMBER_LIMITS[plan];
  if (teamMemberLimit) {
    await sql`
      UPDATE companies
      SET plan = ${plan}, trial_ends_at = NULL, team_member_limit = ${teamMemberLimit}
      WHERE id = ${companyId}
    `;
    return;
  }

  await sql`
    UPDATE companies
    SET plan = ${plan}, trial_ends_at = NULL
    WHERE id = ${companyId}
  `;
}

function formatSubscriptionPeriod(
  subscription?: Pick<ActiveSubscription, 'currentPeriodStart' | 'currentPeriodEnd'> | null
): Pick<PlanStatus, 'currentPeriodStart' | 'currentPeriodEnd'> {
  return {
    currentPeriodStart: subscription?.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
  };
}

/**
 * Count sessions for a company, optionally only those created on or after `since`.
 * For paid plans, `since` is the active subscription's currentPeriodStart so renewals
 * reset the quota.
 */
async function countSessionsSince(companyId: string, since: Date | null): Promise<number> {
  if (since) {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM sessions s
      JOIN challenges c ON s.challenge_id = c.id
      WHERE c.company_id = ${companyId}
        AND s.created_at >= ${since.toISOString()}
        AND (
          s.candidate_lifecycle_status IS NULL
          OR s.started_at IS NOT NULL
        )
    `;
    return count;
  }
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM sessions s
    JOIN challenges c ON s.challenge_id = c.id
    WHERE c.company_id = ${companyId}
      AND (
        s.candidate_lifecycle_status IS NULL
        OR s.started_at IS NOT NULL
      )
  `;
  return count;
}

/**
 * Find the active ArcEval subscription for this user. Labs is the primary source
 * for purchased tier and billing-period dates; the direct Firestore read remains
 * as a fallback while the integration settles.
 *
 * The `currentPeriodStart` field is the source of truth for the billing-period anchor —
 * Razorpay's webhook bumps it on each renewal, which automatically resets the quota.
 */
async function readActiveSubscription(firebaseUid: string): Promise<ActiveSubscription | null> {
  const labsSubscription = await readLabsPlanStatus(firebaseUid);
  if (labsSubscription || labsSubscription === null) {
    return labsSubscription;
  }

  try {
    const db = getAdminFirestore();
    const snap = await db
      .collection('Subscriptions')
      .where('userId', '==', firebaseUid)
      .where('courseId', '==', ENROLLMENT_ID)
      .where('status', '==', 'ACTIVE')
      .get();

    if (snap.empty) return null;

    let latest: ActiveSubscription | null = null;
    for (const doc of snap.docs) {
      const data = doc.data();
      const sub = {
        currentPeriodStart: toDate(data.currentPeriodStart),
        currentPeriodEnd: toDate(data.currentPeriodEnd),
        plan: 'starter' as const,
      };
      if (
        !latest ||
        (sub.currentPeriodStart &&
          (!latest.currentPeriodStart ||
            sub.currentPeriodStart.getTime() > latest.currentPeriodStart.getTime()))
      ) {
        latest = sub;
      }
    }
    return latest;
  } catch (err) {
    console.error('Error reading active subscription:', err);
    return null;
  }
}

async function readLabsPlanStatus(firebaseUid: string): Promise<ActiveSubscription | null | undefined> {
  if (!PLAN_STATUS_URL) return undefined;

  try {
    const res = await fetch(PLAN_STATUS_URL, {
      headers: {
        Authorization: `Bearer ${firebaseUid}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`Labs plan status returned ${res.status}`);
      return undefined;
    }

    const data = (await res.json()) as LabsPlanResponse;
    if (!data.isEnrolled) return null;

    const plan = parsePaidPlan(data.plan);
    if (!plan) {
      console.error('Labs plan status returned an unsupported plan:', data.plan);
      return undefined;
    }

    return {
      plan,
      currentPeriodStart: toDate(data.currentPeriodStart),
      currentPeriodEnd: toDate(data.currentPeriodEnd),
    };
  } catch (err) {
    console.error('Error reading Labs plan status:', err);
    return undefined;
  }
}

function parsePaidPlan(raw: unknown): Exclude<PlanTier, 'trial'> | null {
  return raw === 'starter' || raw === 'growth' || raw === 'enterprise' ? raw : null;
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as { toDate: unknown }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
