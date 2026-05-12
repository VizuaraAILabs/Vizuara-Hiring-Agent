import sql from './db';
import { isAdmin } from './auth';
import { checkEnrollmentStatus } from './enrollment';
import type { Challenge } from '@/types';

export type ChallengeAccessReason =
  | 'ok'
  | 'closed'
  | 'not_started'
  | 'expired'
  | 'email_not_allowed'
  | 'capacity_reached'
  | 'quota_unavailable';

export interface ChallengeAccessResult {
  ok: boolean;
  reason: ChallengeAccessReason;
  status: number;
  message: string;
}

interface ChallengeAccessOptions {
  candidateEmail?: string;
  enforceEmailAllowlist?: boolean;
  enforceCapacity?: boolean;
  enforcePlanQuota?: boolean;
  allowBeforeStart?: boolean;
  db?: typeof sql;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function parseAllowedEmails(raw: unknown): string[] {
  const emails = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];

  return emails
    .map((email) => String(email).trim().toLowerCase())
    .filter(Boolean);
}

export function addEmailToAllowlist(raw: unknown, email: string): string[] {
  const normalized = normalizeEmail(email);
  const emails = parseAllowedEmails(raw);
  return emails.includes(normalized) ? emails : [...emails, normalized];
}

export function unavailableResponse(reason: ChallengeAccessReason, message?: string): ChallengeAccessResult {
  const defaults: Record<ChallengeAccessReason, { status: number; message: string }> = {
    ok: { status: 200, message: 'OK' },
    closed: { status: 403, message: 'This assessment is closed by the company.' },
    not_started: { status: 403, message: 'This assessment is not open yet.' },
    expired: { status: 403, message: 'This assessment window has ended.' },
    email_not_allowed: { status: 403, message: 'Only candidates on the email allowlist are allowed to attempt this assessment.' },
    capacity_reached: { status: 403, message: 'This assessment has reached its maximum number of candidates.' },
    quota_unavailable: { status: 403, message: 'This assessment is temporarily unavailable. Please contact the company.' },
  };

  const fallback = defaults[reason];
  return { ok: false, reason, status: fallback.status, message: message ?? fallback.message };
}

export async function validateChallengeAccess(
  challenge: Challenge,
  options: ChallengeAccessOptions = {}
): Promise<ChallengeAccessResult> {
  const now = new Date();
  const isActive = challenge.is_active === true || challenge.is_active === 1;

  if (!isActive) {
    return unavailableResponse('closed');
  }

  if (!options.allowBeforeStart && challenge.starts_at && now < new Date(challenge.starts_at)) {
    return unavailableResponse('not_started');
  }

  if (challenge.ends_at && now > new Date(challenge.ends_at)) {
    return unavailableResponse('expired');
  }

  if (options.enforceEmailAllowlist && options.candidateEmail) {
    const allowed = parseAllowedEmails(challenge.allowed_emails);
    if (allowed.length > 0 && !allowed.includes(normalizeEmail(options.candidateEmail))) {
      return unavailableResponse('email_not_allowed');
    }
  }

  if (options.enforceCapacity && challenge.sessions_limit != null) {
    const db = options.db ?? sql;
    const [{ count }] = await db<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM sessions WHERE challenge_id = ${challenge.id}
    `;
    if (count >= challenge.sessions_limit) {
      return unavailableResponse('capacity_reached');
    }
  }

  if (options.enforcePlanQuota) {
    const db = options.db ?? sql;
    const [company] = await db<{ email: string }[]>`
      SELECT email FROM companies WHERE id = ${challenge.company_id}
    `;
    const isAdminChallenge = company ? isAdmin(company.email) : false;

    if (!isAdminChallenge) {
      const planStatus = await checkEnrollmentStatus(challenge.company_id);
      if (!planStatus.canCreateSession) {
        return unavailableResponse('quota_unavailable');
      }
    }
  }

  return { ok: true, reason: 'ok', status: 200, message: 'OK' };
}
