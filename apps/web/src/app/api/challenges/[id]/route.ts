import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { validateChallengeSessionLimit } from '@/lib/challenge-settings';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Challenge, Session, StarterFile } from '@/types';

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

    const body = await request.json();
    const hasStarterFiles = Object.prototype.hasOwnProperty.call(body, 'starter_files');
    const hasAccessSettings = ['sessions_limit', 'starts_at', 'ends_at'].some((key) =>
      Object.prototype.hasOwnProperty.call(body, key)
    );

    if (!hasStarterFiles && !hasAccessSettings) {
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

    if (hasAccessSettings) {
      sessionsLimit = body.sessions_limit != null && body.sessions_limit !== ''
        ? Math.max(1, parseInt(body.sessions_limit) || 1)
        : null;

      if (sessionsLimit != null) {
        const limitError = await validateChallengeSessionLimit(user.companyId, sessionsLimit, { challengeId: id });
        if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });
      }

      const parsedStartsAt = body.starts_at ? new Date(body.starts_at) : null;
      const parsedEndsAt = body.ends_at ? new Date(body.ends_at) : null;
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
