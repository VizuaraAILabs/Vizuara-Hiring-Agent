import type { PlanTier } from '@/types';

export const PLAN_LIMITS: Record<PlanTier, number> = {
  trial: 5,
  starter: 50,
  growth: 250,
  enterprise: Infinity,
};

export const PLAN_TEAM_MEMBER_LIMITS: Partial<Record<PlanTier, number>> = {
  growth: 10,
};

export function getPlanTeamMemberLimit(plan: PlanTier, storedLimit: number): number {
  return PLAN_TEAM_MEMBER_LIMITS[plan] ?? storedLimit;
}
