import sql from './db';
import { checkEnrollmentStatus } from './enrollment';

export async function validateChallengeSessionLimit(
  companyId: string,
  sessionsLimit: number | null,
  options: { challengeId?: string } = {}
) {
  if (sessionsLimit == null) return null;

  const planStatus = await checkEnrollmentStatus(companyId);
  if (planStatus.sessionsLimit === -1) return null;

  let currentChallengeSessions = 0;
  if (options.challengeId) {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM sessions WHERE challenge_id = ${options.challengeId}
    `;
    currentChallengeSessions = count;
  }

  const remainingPlanSessions = Math.max(0, planStatus.sessionsLimit - planStatus.sessionsUsed);
  const maxAllowed = currentChallengeSessions + remainingPlanSessions;

  if (sessionsLimit > maxAllowed) {
    return `Session limit cannot exceed your remaining plan availability of ${maxAllowed} assessment${maxAllowed === 1 ? '' : 's'}.`;
  }

  return null;
}
