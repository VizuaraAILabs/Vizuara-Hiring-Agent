import { checkEnrollmentStatus } from './enrollment';

export async function validateChallengeSessionLimit(
  companyId: string,
  sessionsLimit: number | null
) {
  if (sessionsLimit == null) return null;

  const planStatus = await checkEnrollmentStatus(companyId);
  if (planStatus.sessionsLimit === -1) return null;

  const remainingPlanSessions = Math.max(0, planStatus.sessionsLimit - planStatus.sessionsUsed);

  if (sessionsLimit > remainingPlanSessions) {
    return `Session limit cannot exceed your remaining plan availability of ${remainingPlanSessions} assessment${remainingPlanSessions === 1 ? '' : 's'}.`;
  }

  return null;
}
