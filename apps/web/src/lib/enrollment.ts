import sql from './db';
import { getAdminFirestore } from './firebase-admin';
import type { PlanTier, PlanStatus } from '@/types';

const ENROLLMENT_ID = process.env.ARCEVAL_ENROLLMENT_ID || '';
const PAYMENT_URL = process.env.ARCEVAL_PAYMENT_URL || '';

const PLAN_LIMITS: Record<PlanTier, number> = {
  trial: 5,
  starter: 50,
  growth: 250,
  enterprise: Infinity,
};

interface ActiveSubscription {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
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
  }[]>`
    SELECT firebase_uid, plan, trial_ends_at FROM companies WHERE id = ${companyId}
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

  // 2. Trial plans: check Firestore for an active subscription, then fall through
  if (company.plan === 'trial') {
    if (company.firebase_uid) {
      const subscription = await readActiveSubscription(company.firebase_uid);
      if (subscription) {
        // Default to starter plan when newly enrolled
        const newPlan: PlanTier = 'starter';
        await sql`UPDATE companies SET plan = ${newPlan} WHERE id = ${companyId}`;
        const sessionsUsed = await countSessionsSince(companyId, subscription.currentPeriodStart);
        return checkPaidPlan(newPlan, sessionsUsed, trialEndsAt);
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
        trialEndsAt,
        paymentUrl,
      };
    }
    const sessionsUsed = await countSessionsSince(companyId, subscription.currentPeriodStart);
    return checkPaidPlan(company.plan, sessionsUsed, trialEndsAt);
  }

  const sessionsUsed = await countSessionsSince(companyId, null);
  return checkPaidPlan(company.plan, sessionsUsed, trialEndsAt);
}

function checkPaidPlan(
  plan: PlanTier,
  sessionsUsed: number,
  trialEndsAt: string | null
): PlanStatus {
  const limit = PLAN_LIMITS[plan];
  const paymentUrl = `${process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai'}/pricing`;

  if (sessionsUsed >= limit) {
    return {
      canCreateSession: false,
      reason: 'quota_exceeded',
      sessionsUsed,
      sessionsLimit: limit === Infinity ? -1 : limit,
      plan,
      trialEndsAt,
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
    `;
    return count;
  }
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM sessions s
    JOIN challenges c ON s.challenge_id = c.id
    WHERE c.company_id = ${companyId}
  `;
  return count;
}

/**
 * Find the active subscription for this user + course in the `subscriptions` Firestore
 * collection. Returns null if none is currently active. If multiple actives exist
 * (shouldn't, but defensively), the one with the latest currentPeriodStart wins.
 *
 * The `currentPeriodStart` field is the source of truth for the billing-period anchor —
 * Razorpay's webhook bumps it on each renewal, which automatically resets the quota.
 */
async function readActiveSubscription(firebaseUid: string): Promise<ActiveSubscription | null> {
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
