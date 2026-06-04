import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, hasCompanyRole } from '@/lib/auth';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Challenge } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const MAX_TITLE_LENGTH = 160;

function normalizeTitle(value: unknown, fallback: string) {
  const title = typeof value === 'string' ? value.trim() : '';
  return (title || fallback).slice(0, MAX_TITLE_LENGTH);
}

function optionalBoolean(value: unknown, defaultValue: boolean) {
  if (value == null) return defaultValue;
  if (typeof value !== 'boolean') throw new Error('Duplicate options must be booleans.');
  return value;
}

function serializeStarterFiles(value: Challenge['starter_files']) {
  if (!value) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }
    if (!hasCompanyRole(user, ['owner', 'recruiter'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const source = await getChallengeById(id);
    if (!source) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (source.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    let copyStarterFiles: boolean;
    let copyAllowedEmails: boolean;
    let copyAccessWindow: boolean;
    let copyCohortLabel: boolean;
    try {
      copyStarterFiles = optionalBoolean(body.copy_starter_files, true);
      copyAllowedEmails = optionalBoolean(body.copy_allowed_emails, false);
      copyAccessWindow = optionalBoolean(body.copy_access_window, false);
      copyCohortLabel = optionalBoolean(body.copy_cohort_label, true);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid duplicate options.' },
        { status: 400 }
      );
    }

    const duplicateId = uuidv4();
    const title = normalizeTitle(body.title, `Copy of ${source.title}`);

    const [duplicate] = await sql<Challenge[]>`
      INSERT INTO challenges (
        id,
        company_id,
        title,
        description,
        time_limit_min,
        is_active,
        starter_files_dir,
        starter_files,
        sessions_limit,
        allowed_emails,
        starts_at,
        ends_at,
        role,
        tech_stack,
        seniority,
        focus_areas,
        context,
        cohort_label,
        archived_at
      )
      VALUES (
        ${duplicateId},
        ${source.company_id},
        ${title},
        ${source.description},
        ${source.time_limit_min},
        FALSE,
        ${copyStarterFiles ? source.starter_files_dir : null},
        ${copyStarterFiles ? serializeStarterFiles(source.starter_files) : null},
        NULL,
        ${copyAllowedEmails ? source.allowed_emails : null},
        ${copyAccessWindow ? source.starts_at : null},
        ${copyAccessWindow ? source.ends_at : null},
        ${source.role},
        ${source.tech_stack},
        ${source.seniority},
        ${source.focus_areas},
        ${source.context},
        ${copyCohortLabel ? source.cohort_label : null},
        NULL
      )
      RETURNING *
    `;

    return NextResponse.json(duplicate, { status: 201 });
  } catch (error) {
    console.error('Error duplicating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
