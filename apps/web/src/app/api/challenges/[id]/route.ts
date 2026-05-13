import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { validateChallengeSessionLimit } from '@/lib/challenge-settings';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Challenge, Session, StarterFile } from '@/types';

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeRequiredString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const sessions = await sql<Session[]>`
      SELECT * FROM sessions WHERE challenge_id = ${id} ORDER BY created_at DESC
    `;

    // Ensure starter_files is always a parsed array (postgres may return it as a string)
    const starterFiles = typeof challenge.starter_files === 'string'
      ? JSON.parse(challenge.starter_files)
      : challenge.starter_files;

    return NextResponse.json({ ...challenge, starter_files: starterFiles, sessions });
  } catch (error) {
    console.error('Error fetching challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { id } = await params;

    const challenge = await getChallengeById(id);

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const hasStarterFiles = hasOwn(body, 'starter_files');
    const hasAccessSettings = ['sessions_limit', 'starts_at', 'ends_at'].some((key) =>
      hasOwn(body, key)
    );
    const hasChallengeSettings = [
      'title',
      'description',
      'time_limit_min',
      'role',
      'tech_stack',
      'seniority',
      'focus_areas',
      'context',
      'cohort_label',
    ].some((key) =>
      hasOwn(body, key)
    );

    if (!hasStarterFiles && !hasAccessSettings && !hasChallengeSettings) {
      return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 });
    }

    let starterFilesJson: string | null | undefined;
    if (hasStarterFiles) {
      const { starter_files } = body;
      if (!Array.isArray(starter_files)) {
        return NextResponse.json({ error: 'starter_files must be an array' }, { status: 400 });
      }

      for (const file of starter_files as StarterFile[]) {
        if (!file.path || typeof file.path !== 'string') {
          return NextResponse.json({ error: 'Each file must have a valid path' }, { status: 400 });
        }
        if (file.path.includes('..') || file.path.startsWith('/')) {
          return NextResponse.json({ error: 'Invalid file path: ' + file.path }, { status: 400 });
        }
        if (typeof file.content !== 'string') {
          return NextResponse.json({ error: 'Each file must have string content' }, { status: 400 });
        }
      }

      starterFilesJson = starter_files.length > 0 ? JSON.stringify(starter_files) : null;
    }

    let sessionsLimit = challenge.sessions_limit;
    let startsAt = challenge.starts_at;
    let endsAt = challenge.ends_at;
    let title = challenge.title;
    let description = challenge.description;
    let timeLimitMin = challenge.time_limit_min;
    let role = challenge.role;
    let techStack = challenge.tech_stack;
    let seniority = challenge.seniority;
    let focusAreas = challenge.focus_areas;
    let context = challenge.context;
    let cohortLabel = challenge.cohort_label;

    if (hasAccessSettings) {
      if (body.sessions_limit != null && body.sessions_limit !== '') {
        const parsedSessionsLimit = Number(body.sessions_limit);
        if (!Number.isFinite(parsedSessionsLimit) || parsedSessionsLimit < 0) {
          return NextResponse.json({ error: 'Session limit must be zero or greater.' }, { status: 400 });
        }
        sessionsLimit = Math.floor(parsedSessionsLimit);
      } else {
        sessionsLimit = null;
      }

      if (sessionsLimit != null) {
        const limitError = await validateChallengeSessionLimit(user.companyId, sessionsLimit);
        if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });
      }

      const parsedStartsAt = body.starts_at ? new Date(String(body.starts_at)) : null;
      const parsedEndsAt = body.ends_at ? new Date(String(body.ends_at)) : null;
      if (
        (parsedStartsAt && Number.isNaN(parsedStartsAt.getTime())) ||
        (parsedEndsAt && Number.isNaN(parsedEndsAt.getTime()))
      ) {
        return NextResponse.json({ error: 'Invalid assessment window date.' }, { status: 400 });
      }
      if (parsedStartsAt && parsedEndsAt && parsedStartsAt >= parsedEndsAt) {
        return NextResponse.json({ error: 'Assessment end time must be after the start time.' }, { status: 400 });
      }

      startsAt = parsedStartsAt ? parsedStartsAt.toISOString() : null;
      endsAt = parsedEndsAt ? parsedEndsAt.toISOString() : null;
    }

    if (hasChallengeSettings) {
      if (hasOwn(body, 'title')) {
        title = normalizeRequiredString(body.title);
        if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      }

      if (hasOwn(body, 'description')) {
        description = normalizeRequiredString(body.description);
        if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 });
      }

      if (hasOwn(body, 'time_limit_min')) {
        const parsedTimeLimit = Number(body.time_limit_min);
        if (!Number.isFinite(parsedTimeLimit)) {
          return NextResponse.json({ error: 'Time limit must be a number' }, { status: 400 });
        }

        timeLimitMin = Math.max(10, Math.min(45, Math.round(parsedTimeLimit)));
        if (timeLimitMin !== challenge.time_limit_min) {
          const [{ started_count }] = await sql<{ started_count: number }[]>`
            SELECT COUNT(*)::int AS started_count
            FROM sessions
            WHERE challenge_id = ${id}
              AND started_at IS NOT NULL
          `;

          if (started_count > 0) {
            return NextResponse.json(
              { error: 'Time limit cannot be changed after candidates have started.' },
              { status: 400 }
            );
          }
        }
      }

      if (hasOwn(body, 'role')) role = normalizeOptionalString(body.role);
      if (hasOwn(body, 'tech_stack')) techStack = normalizeOptionalString(body.tech_stack);
      if (hasOwn(body, 'seniority')) seniority = normalizeOptionalString(body.seniority);
      if (hasOwn(body, 'focus_areas')) focusAreas = normalizeOptionalString(body.focus_areas);
      if (hasOwn(body, 'context')) context = normalizeOptionalString(body.context);
      if (hasOwn(body, 'cohort_label')) cohortLabel = normalizeOptionalString(body.cohort_label);
    }

    const preservedStarterFiles = typeof challenge.starter_files === 'string'
      ? challenge.starter_files
      : challenge.starter_files
        ? JSON.stringify(challenge.starter_files)
        : null;
    const nextStarterFiles: string | null = hasStarterFiles
      ? starterFilesJson ?? null
      : preservedStarterFiles;

    const [updated] = await sql<Challenge[]>`
      UPDATE challenges
      SET
        title = ${title},
        description = ${description},
        time_limit_min = ${timeLimitMin},
        role = ${role},
        tech_stack = ${techStack},
        seniority = ${seniority},
        focus_areas = ${focusAreas},
        context = ${context},
        cohort_label = ${cohortLabel},
        starter_files = ${nextStarterFiles},
        sessions_limit = ${sessionsLimit},
        starts_at = ${startsAt},
        ends_at = ${endsAt}
      WHERE id = ${id}
      RETURNING *
    `;

    // Ensure starter_files is a parsed array
    const parsedFiles = typeof updated.starter_files === 'string'
      ? JSON.parse(updated.starter_files)
      : updated.starter_files;

    return NextResponse.json({ ...updated, starter_files: parsedFiles });
  } catch (error) {
    console.error('Error updating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
