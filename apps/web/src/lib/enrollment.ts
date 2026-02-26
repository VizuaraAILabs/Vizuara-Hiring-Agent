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

  // 2. Count total sessions for this company
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM sessions s
    JOIN challenges c ON s.challenge_id = c.id
    WHERE c.company_id = ${companyId}
  `;

  const sessionsUsed = count;
  const trialEndsAt = company.trial_ends_at;

  // 3. If on trial plan, check trial-specific logic
  if (company.plan === 'trial') {
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

    // Trial expired — check if they've enrolled (paid) via Firestore
    if (company.firebase_uid) {
      const updatedPlan = await syncEnrollmentFromFirestore(companyId, company.firebase_uid);
      if (updatedPlan) {
        // Re-check with updated plan
        return checkPaidPlan(companyId, updatedPlan, sessionsUsed, trialEndsAt);
      }
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

  // 4. For paid plans, verify enrollment is still active
  if (company.firebase_uid) {
    const stillActive = await isEnrollmentActive(company.firebase_uid);
    if (!stillActive) {
      // Payment lapsed — downgrade to trial
      await sql`UPDATE companies SET plan = 'trial' WHERE id = ${companyId}`;
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
  }

  return checkPaidPlan(companyId, company.plan, sessionsUsed, trialEndsAt);
}

function checkPaidPlan(
  _companyId: string,
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
 * Check if the Firestore enrollment doc is still ACTIVE.
 */
async function isEnrollmentActive(firebaseUid: string): Promise<boolean> {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection('Enrollments').doc(`${firebaseUid}_${ENROLLMENT_ID}`).get();
    if (!doc.exists) return false;
    const data = doc.data();
    return data?.status === 'ACTIVE';
  } catch (err) {
    console.error('Error checking enrollment status:', err);
    // Fail closed for paid plans
    return false;
  }
}

/**
 * Sync enrollment from Firestore and update the company's plan in our DB.
 * Returns the new plan tier if enrollment is active, null otherwise.
 */
async function syncEnrollmentFromFirestore(
  companyId: string,
  firebaseUid: string
): Promise<PlanTier | null> {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection('Enrollments').doc(`${firebaseUid}_${ENROLLMENT_ID}`).get();

    if (!doc.exists) return null;

    const data = doc.data();
    if (data?.status !== 'ACTIVE') return null;

    // Default to starter plan when enrolled
    const newPlan: PlanTier = 'starter';
    await sql`UPDATE companies SET plan = ${newPlan} WHERE id = ${companyId}`;
    return newPlan;
  } catch (err) {
    console.error('Error syncing enrollment from Firestore:', err);
    return null;
  }
}
