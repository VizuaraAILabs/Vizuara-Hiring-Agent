import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { getChallengeById } from '@/lib/challenge-queries';
import { getDecisionLabel, getRecommendationLabel } from '@/lib/utils';

type AnalyticsSessionRow = {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  candidate_lifecycle_status: string | null;
  decision_label: string | null;
  overall_score: number | string | null;
  hiring_recommendation: string | null;
};

const completedStatuses = new Set(['completed', 'queued', 'analyzing', 'analyzed', 'analysis failed']);
const excludedUnstartedLifecycleStatuses = new Set(['revoked', 'no_show', 'withdrawn', 'disqualified']);
const recommendationOrder = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'];
const decisionOrder = ['shortlisted', 'hold', 'reject', 'hired'];

function toTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function toNumber(value: number | string | null) {
  if (value == null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const challenge = await getChallengeById(id);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.companyId && !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await sql<AnalyticsSessionRow[]>`
      SELECT
        s.id,
        s.status,
        s.started_at,
        s.ended_at,
        s.candidate_lifecycle_status,
        s.decision_label,
        a.overall_score,
        a.hiring_recommendation
      FROM sessions s
      LEFT JOIN analysis_results a ON a.session_id = s.id
      WHERE s.challenge_id = ${id}
      ORDER BY s.created_at DESC
    `;

    const totalSessions = rows.length;
    const startedCount = rows.filter((row) => Boolean(row.started_at)).length;
    const completedCount = rows.filter((row) => row.ended_at || completedStatuses.has(row.status)).length;
    const analyzedRows = rows.filter((row) => toNumber(row.overall_score) != null);
    const analyzedCount = analyzedRows.length;
    const activeCount = rows.filter((row) => row.status === 'active').length;
    const pendingCount = rows.filter((row) => row.status === 'pending' && !row.started_at).length;
    const durationMinutes = rows
      .map((row) => {
        const startedAt = toTime(row.started_at);
        const endedAt = toTime(row.ended_at);
        if (startedAt == null || endedAt == null || endedAt < startedAt) return null;
        return Math.ceil((endedAt - startedAt) / 60000);
      })
      .filter((value): value is number => value != null);
    const averageDurationMinutes = durationMinutes.length
      ? Math.round(durationMinutes.reduce((sum, value) => sum + value, 0) / durationMinutes.length)
      : null;
    const scores = analyzedRows
      .map((row) => toNumber(row.overall_score))
      .filter((score): score is number => score != null);
    const averageScore = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null;
    const scoreBands = [
      { label: '80-100', count: scores.filter((score) => score >= 80).length },
      { label: '60-79', count: scores.filter((score) => score >= 60 && score < 80).length },
      { label: '40-59', count: scores.filter((score) => score >= 40 && score < 60).length },
      { label: '<40', count: scores.filter((score) => score < 40).length },
    ];
    const recommendationDistribution = recommendationOrder.map((key) => ({
      key,
      label: getRecommendationLabel(key),
      count: rows.filter((row) => row.hiring_recommendation === key).length,
    }));
    const decisionDistribution = decisionOrder.map((key) => ({
      key,
      label: getDecisionLabel(key),
      count: rows.filter((row) => row.decision_label === key).length,
    }));
    const lifecycleCounts = {
      noShow: rows.filter((row) => row.candidate_lifecycle_status === 'no_show').length,
      withdrawn: rows.filter((row) => row.candidate_lifecycle_status === 'withdrawn').length,
      disqualified: rows.filter((row) => row.candidate_lifecycle_status === 'disqualified').length,
      revoked: rows.filter((row) => row.candidate_lifecycle_status === 'revoked').length,
    };
    const capacityUsed = rows.filter((row) =>
      row.started_at || !excludedUnstartedLifecycleStatuses.has(row.candidate_lifecycle_status ?? '')
    ).length;
    const capacityLimit = challenge.sessions_limit ?? null;
    const startsAt = challenge.starts_at ?? null;
    const endsAt = challenge.ends_at ?? null;
    const startTime = toTime(startsAt);
    const endTime = toTime(endsAt);
    const now = Date.now();
    const hasWindow = startTime != null || endTime != null;
    const accessWindow = {
      startsAt,
      endsAt,
      status: !hasWindow
        ? 'not_set'
        : startTime != null && now < startTime
          ? 'not_started'
          : endTime != null && now > endTime
            ? 'ended'
            : 'open',
      elapsedPercent: startTime != null && endTime != null && endTime > startTime
        ? Math.min(100, Math.max(0, percent(now - startTime, endTime - startTime)))
        : null,
    };

    return NextResponse.json({
      totalSessions,
      startedCount,
      completedCount,
      analyzedCount,
      activeCount,
      pendingCount,
      averageScore,
      averageDurationMinutes,
      funnel: [
        { label: 'Invited', count: totalSessions, percent: percent(totalSessions, totalSessions) },
        { label: 'Started', count: startedCount, percent: percent(startedCount, totalSessions) },
        { label: 'Completed', count: completedCount, percent: percent(completedCount, totalSessions) },
        { label: 'Analyzed', count: analyzedCount, percent: percent(analyzedCount, totalSessions) },
      ],
      scoreBands,
      recommendationDistribution,
      decisionDistribution,
      lifecycleCounts,
      capacity: {
        limit: capacityLimit,
        used: capacityUsed,
        percent: capacityLimit && capacityLimit > 0 ? percent(capacityUsed, capacityLimit) : null,
      },
      accessWindow,
    });
  } catch (error) {
    console.error('Error fetching challenge analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
