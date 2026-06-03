import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { getChallengeById } from '@/lib/challenge-queries';
import type {
  IntegrityReviewLevel,
  IntegritySignal,
  IntegritySummary,
  Interaction,
  Session,
  WorkspaceSnapshot,
} from '@/types';

type InteractionRow = Omit<Interaction, 'metadata'> & { metadata: unknown };

type CohortSession = Pick<Session, 'id' | 'candidate_name'> & { workspace_snapshot: unknown };

const TEST_COMMAND_PATTERN = /\b(npm\s+test|npm\s+run\s+test|yarn\s+test|pnpm\s+test|pytest|jest|vitest|go\s+test|cargo\s+test|rspec|make\s+test|mvn\s+test|gradle\s+test)\b/i;
const LARGE_FILE_EDIT_BYTES = 10_000;
const IDLE_GAP_MINUTES = 10;

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeWorkspaceSnapshot(snapshot: unknown): WorkspaceSnapshot | null {
  let parsed = snapshot;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<WorkspaceSnapshot>;
  return Array.isArray(candidate.files) ? candidate as WorkspaceSnapshot : null;
}

function fileEditInfo(interaction: InteractionRow, metadata: Record<string, unknown>) {
  const sizeFromMetadata = Number(metadata.size_bytes ?? 0);
  const sizeFromContent = Number(interaction.content.match(/^Size:\s+(\d+)\s+bytes$/m)?.[1] ?? 0);
  const pathFromContent = interaction.content.match(/^\[FILE EDIT\]\s+Saved\s+(.+)$/m)?.[1]?.trim();

  return {
    sizeBytes: Number.isFinite(sizeFromMetadata) && sizeFromMetadata > 0
      ? sizeFromMetadata
      : Number.isFinite(sizeFromContent)
        ? sizeFromContent
        : 0,
    path: typeof metadata.path === 'string' && metadata.path
      ? metadata.path
      : pathFromContent ?? 'file',
  };
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60_000);
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function normalizeContent(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\/\/.*$/gm, '')
    .replace(/#.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function workspaceFingerprints(snapshot: unknown): Set<string> {
  const fingerprints = new Set<string>();
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  for (const file of normalized?.files ?? []) {
    if (file.truncated || !file.content.trim()) continue;
    const normalized = normalizeContent(file.content);
    if (normalized.length < 80) continue;
    fingerprints.add(hash(`${file.path}:${normalized}`));

    const tokens = normalized.split(/\W+/).filter((token) => token.length > 2);
    for (let i = 0; i <= tokens.length - 12; i += 6) {
      fingerprints.add(hash(tokens.slice(i, i + 12).join(' ')));
    }
  }
  return fingerprints;
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return null;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function addSignal(signals: IntegritySignal[], signal: IntegritySignal) {
  signals.push(signal);
}

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });

    const { sessionId } = await params;

    const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const challenge = await getChallengeById(session.challenge_id);
    if (!challenge || challenge.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const interactions = await sql<InteractionRow[]>`
      SELECT * FROM interactions
      WHERE session_id = ${sessionId}
      ORDER BY sequence_num ASC
    `;

    const cohortSessions = await sql<CohortSession[]>`
      SELECT id, candidate_name, workspace_snapshot
      FROM sessions
      WHERE challenge_id = ${session.challenge_id}
        AND id <> ${sessionId}
        AND workspace_snapshot IS NOT NULL
    `;

    const durationMinutes = minutesBetween(session.started_at ?? session.created_at, session.ended_at);
    const startedMs = new Date(session.started_at ?? session.created_at).getTime();
    const endedMs = session.ended_at ? new Date(session.ended_at).getTime() : NaN;
    const sessionSpanMs = Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs > startedMs
      ? endedMs - startedMs
      : null;

    const fileEdits = interactions
      .map((interaction) => {
        const metadata = parseMetadata(interaction.metadata);
        return { interaction, metadata, info: fileEditInfo(interaction, metadata) };
      })
      .filter(({ metadata, interaction }) =>
        metadata.action === 'file_edit' || interaction.content.startsWith('[FILE EDIT]')
      );

    const largeFileEdits = fileEdits.filter(({ info }) => info.sizeBytes >= LARGE_FILE_EDIT_BYTES);

    const largeLateChanges = largeFileEdits.filter(({ interaction }) => {
      if (!sessionSpanMs || !Number.isFinite(startedMs)) return false;
      const occurredMs = new Date(interaction.timestamp).getTime();
      return Number.isFinite(occurredMs) && (occurredMs - startedMs) / sessionSpanMs >= 0.75;
    });

    const testRuns = interactions.filter((interaction) => TEST_COMMAND_PATTERN.test(interaction.content));
    const lastLargeChangeMs = largeFileEdits.length
      ? Math.max(...largeFileEdits.map(({ interaction }) => new Date(interaction.timestamp).getTime()).filter(Number.isFinite))
      : null;
    const testsAfterLargeChange = lastLargeChangeMs != null
      ? testRuns.some((interaction) => new Date(interaction.timestamp).getTime() > lastLargeChangeMs)
      : false;

    const idleGaps: number[] = [];
    for (let i = 1; i < interactions.length; i += 1) {
      const previous = new Date(interactions[i - 1].timestamp).getTime();
      const current = new Date(interactions[i].timestamp).getTime();
      if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
      const gapMinutes = Math.round((current - previous) / 60_000);
      if (gapMinutes >= IDLE_GAP_MINUTES) idleGaps.push(gapMinutes);
    }

    const currentFingerprints = workspaceFingerprints(session.workspace_snapshot);
    let highestSimilarity: number | null = null;
    let matchingSession: CohortSession | null = null;
    let comparedSessions = 0;
    for (const cohortSession of cohortSessions) {
      const similarity = jaccard(currentFingerprints, workspaceFingerprints(cohortSession.workspace_snapshot));
      if (similarity == null) continue;
      comparedSessions += 1;
      if (highestSimilarity == null || similarity > highestSimilarity) {
        highestSimilarity = similarity;
        matchingSession = cohortSession;
      }
    }

    const signals: IntegritySignal[] = [];

    if (testRuns.length > 0) {
      addSignal(signals, {
        id: 'verification_trail',
        title: 'Verification trail present',
        description: `${testRuns.length} test or validation command${testRuns.length === 1 ? '' : 's'} found in the terminal history.`,
        tone: 'positive',
        evidence: testRuns.slice(-3).map((interaction) => interaction.content.trim().slice(0, 140)),
      });
    } else {
      addSignal(signals, {
        id: 'no_test_runs',
        title: 'Limited explicit verification',
        description: 'No common test or validation command was detected in the terminal history.',
        tone: 'review',
        evidence: ['No npm test, pytest, jest, go test, cargo test, or similar command was found.'],
      });
    }

    if (largeFileEdits.length > 0) {
      addSignal(signals, {
        id: 'large_file_edits',
        title: 'Large code changes observed',
        description: `${largeFileEdits.length} saved file edit${largeFileEdits.length === 1 ? '' : 's'} exceeded ${Math.round(LARGE_FILE_EDIT_BYTES / 1000)} KB.`,
        tone: largeLateChanges.length > 0 && !testsAfterLargeChange ? 'review' : 'neutral',
        evidence: largeFileEdits.slice(-3).map(({ info }) =>
          `${info.path} (${Math.round(info.sizeBytes / 1000)} KB)`
        ),
      });
    }

    if (largeLateChanges.length > 0) {
      addSignal(signals, {
        id: 'late_large_changes',
        title: 'Late-session large changes',
        description: `${largeLateChanges.length} large edit${largeLateChanges.length === 1 ? '' : 's'} happened in the final quarter of the session.`,
        tone: testsAfterLargeChange ? 'neutral' : 'review',
        evidence: testsAfterLargeChange
          ? ['A test or validation command was detected after the latest large edit.']
          : ['No test or validation command was detected after the latest large edit.'],
      });
    }

    if (idleGaps.length > 0) {
      addSignal(signals, {
        id: 'idle_gaps',
        title: 'Long idle gaps',
        description: `${idleGaps.length} activity gap${idleGaps.length === 1 ? '' : 's'} of ${IDLE_GAP_MINUTES}+ minutes appeared in the session.`,
        tone: 'neutral',
        evidence: [`Longest gap: ${formatMinutes(Math.max(...idleGaps))}.`],
      });
    }

    if (durationMinutes != null && durationMinutes <= Math.max(5, Math.round(challenge.time_limit_min * 0.2))) {
      addSignal(signals, {
        id: 'short_completion',
        title: 'Very short completion time',
        description: `The session completed in ${formatMinutes(durationMinutes)} against a ${challenge.time_limit_min} min assessment window.`,
        tone: 'review',
        evidence: ['Short completion is context for review, not a misconduct finding.'],
      });
    }

    if (highestSimilarity != null && highestSimilarity >= 0.65) {
      addSignal(signals, {
        id: 'workspace_similarity',
        title: 'High workspace similarity',
        description: `Final workspace is ${Math.round(highestSimilarity * 100)}% similar to another submission in this challenge cohort.`,
        tone: highestSimilarity >= 0.85 ? 'warning' : 'review',
        evidence: matchingSession
          ? [`Closest match: ${matchingSession.candidate_name}.`]
          : ['Closest matching session could not be identified.'],
      });
    } else if (comparedSessions > 0) {
      addSignal(signals, {
        id: 'workspace_similarity_low',
        title: 'No high workspace similarity found',
        description: `Compared final workspace against ${comparedSessions} other captured submission${comparedSessions === 1 ? '' : 's'}.`,
        tone: 'positive',
        evidence: highestSimilarity == null
          ? ['No comparable workspace fingerprints were available.']
          : [`Highest similarity: ${Math.round(highestSimilarity * 100)}%.`],
      });
    }

    if (interactions.length === 0) {
      addSignal(signals, {
        id: 'no_interactions',
        title: 'No interaction trail available',
        description: 'No terminal interactions were found for this session.',
        tone: 'warning',
        evidence: ['Ownership signals are limited because the interaction log is empty.'],
      });
    }

    let ownershipScore = 80;
    if (testRuns.length === 0) ownershipScore -= 18;
    if (largeLateChanges.length > 0 && !testsAfterLargeChange) ownershipScore -= 22;
    if (durationMinutes != null && durationMinutes <= Math.max(5, Math.round(challenge.time_limit_min * 0.2))) ownershipScore -= 12;
    if (highestSimilarity != null && highestSimilarity >= 0.65) ownershipScore -= highestSimilarity >= 0.85 ? 30 : 18;
    if (interactions.length < 5) ownershipScore -= 20;
    ownershipScore = Math.max(0, Math.min(100, ownershipScore));

    let reviewLevel: IntegrityReviewLevel = 'low';
    if (interactions.length === 0) {
      reviewLevel = 'insufficient_data';
    } else if (interactions.length < 5 || (testRuns.length === 0 && fileEdits.length === 0)) {
      reviewLevel = 'limited_evidence';
    } else if (
      (highestSimilarity != null && highestSimilarity >= 0.65) ||
      (largeLateChanges.length > 0 && !testsAfterLargeChange) ||
      (durationMinutes != null && durationMinutes <= Math.max(5, Math.round(challenge.time_limit_min * 0.2)))
    ) {
      reviewLevel = 'review';
    }

    const summaryByLevel: Record<IntegrityReviewLevel, string> = {
      low: 'The available session trail shows ordinary ownership signals. Reviewers can still inspect the evidence below for context.',
      review: 'This session has one or more ownership signals worth reviewing, but they should be interpreted as context rather than misconduct.',
      limited_evidence: 'The available trail has limited evidence of how the candidate reached the final result.',
      insufficient_data: 'There is not enough captured session data to summarize ownership signals.',
    };

    const summary: IntegritySummary = {
      session_id: sessionId,
      review_level: reviewLevel,
      ownership_score: ownershipScore,
      summary: summaryByLevel[reviewLevel],
      metrics: {
        interaction_count: interactions.length,
        prompt_count: interactions.filter((interaction) => interaction.content_type === 'prompt').length,
        command_count: interactions.filter((interaction) => interaction.content_type === 'command').length,
        test_run_count: testRuns.length,
        file_edit_count: fileEdits.length,
        large_file_edit_count: largeFileEdits.length,
        large_late_change_count: largeLateChanges.length,
        idle_gap_count: idleGaps.length,
        max_idle_gap_minutes: idleGaps.length ? Math.max(...idleGaps) : 0,
        duration_minutes: durationMinutes,
      },
      workspace_similarity: {
        compared_sessions: comparedSessions,
        highest_similarity: highestSimilarity,
        matching_session_id: matchingSession?.id ?? null,
        matching_candidate_name: matchingSession?.candidate_name ?? null,
      },
      signals,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error generating integrity summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
