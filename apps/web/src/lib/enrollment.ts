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

interface EnrollmentDoc {
  status: string;
  enrollmentDate: Date | null;
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

  // 2. Trial plans: check Firestore for an upgrade, then fall through
  if (company.plan === 'trial') {
    if (company.firebase_uid) {
      const enrollment = await readEnrollmentDoc(company.firebase_uid);
      if (enrollment?.status === 'ACTIVE') {
        // Default to starter plan when newly enrolled
        const newPlan: PlanTier = 'starter';
        await sql`UPDATE companies SET plan = ${newPlan} WHERE id = ${companyId}`;
        const sessionsUsed = await countSessionsSince(companyId, enrollment.enrollmentDate);
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

  // 3. Paid plans: verify enrollment is still active and use enrollmentDate as the period start
  if (company.firebase_uid) {
    const enrollment = await readEnrollmentDoc(company.firebase_uid);
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      // Payment lapsed — downgrade to trial
      await sql`UPDATE companies SET plan = 'trial' WHERE id = ${companyId}`;
      const sessionsUsed = await countSessionsSince(companyId, null);
      return {
        canCreateSession: false,
        reason: 'not_enrolled',
        sessionsUsed,
        sessionsLimit: PLAN_LIMITS.trial,
        plan: 'trial',
        trialEndsAt,
        paymentUrl,
      };
    }
    const sessionsUsed = await countSessionsSince(companyId, enrollment.enrollmentDate);
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
 * For paid plans, `since` is the latest enrollmentDate so renewals reset the quota.
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
 * Read the Firestore Enrollment doc, returning status and the latest enrollmentDate.
 * enrollmentDate is treated as the current billing period start — it should be bumped
 * by the payment system on each renewal.
 */
async function readEnrollmentDoc(firebaseUid: string): Promise<EnrollmentDoc | null> {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection('Enrollments').doc(`${firebaseUid}_${ENROLLMENT_ID}`).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    const raw = data.enrollmentDate;
    let enrollmentDate: Date | null = null;
    if (raw?.toDate) enrollmentDate = raw.toDate();
    else if (typeof raw === 'string' || typeof raw === 'number') enrollmentDate = new Date(raw);
    else if (raw instanceof Date) enrollmentDate = raw;
    return { status: data.status, enrollmentDate };
  } catch (err) {
    console.error('Error reading enrollment doc:', err);
    return null;
  }
}
