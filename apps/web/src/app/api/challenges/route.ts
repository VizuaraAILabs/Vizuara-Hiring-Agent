import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { validateChallengeSessionLimit } from '@/lib/challenge-settings';
import { getChallengeById } from '@/lib/challenge-queries';
import { v4 as uuidv4 } from 'uuid';

type ChallengeView = 'active' | 'closed' | 'archived' | 'all';

function normalizeView(value: string | null): ChallengeView {
  if (value === 'closed' || value === 'archived' || value === 'all') return value;
  return 'active';
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = normalizeView(searchParams.get('view'));

    const challenges = await sql`
      SELECT
        c.id,
        c.company_id,
        c.title,
        c.description,
        c.time_limit_min,
        c.is_active,
        c.starter_files_dir,
        c.starter_files,
        c.sessions_limit,
        c.allowed_emails,
        c.starts_at,
        c.ends_at,
        c.role,
        c.tech_stack,
        c.seniority,
        c.focus_areas,
        c.context,
        c.cohort_label,
        c.archived_at,
        c.created_at,
        (c.starter_files IS NOT NULL OR c.starter_files_dir IS NOT NULL) AS has_starter_files,
        (c.allowed_emails IS NOT NULL AND array_length(c.allowed_emails, 1) > 0) AS has_allowed_emails,
        (c.starts_at IS NOT NULL OR c.ends_at IS NOT NULL) AS has_access_window,
        COUNT(s.id)::int as candidate_count
      FROM challenges c
      LEFT JOIN sessions s ON s.challenge_id = c.id
      WHERE c.company_id = ${user.companyId}
        AND (
          ${view} = 'all'
          OR (${view} = 'archived' AND c.archived_at IS NOT NULL)
          OR (${view} = 'active' AND c.archived_at IS NULL AND c.is_active = TRUE AND (c.ends_at IS NULL OR c.ends_at > NOW()))
          OR (${view} = 'closed' AND c.archived_at IS NULL AND (c.is_active = FALSE OR c.ends_at <= NOW()))
        )
      GROUP BY c.id
      ORDER BY COALESCE(c.archived_at, c.created_at) DESC
    `;

    return NextResponse.json(challenges);
  } catch (error) {
    console.error('Error listing challenges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { title, description, time_limit_min, starter_files_dir, starter_files, sessions_limit, allowed_emails, starts_at, ends_at, role, tech_stack, seniority, focus_areas, context, cohort_label } = await request.json();

    if (!title || !description) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const id = uuidv4();
    const timeLimit = Math.max(10, Math.min(45, time_limit_min || 30));
    const starterDir = starter_files_dir || null;
    const starterFiles = Array.isArray(starter_files) && starter_files.length > 0
      ? JSON.stringify(starter_files)
      : null;
    let sessionsLimit: number | null = null;
    if (sessions_limit != null && sessions_limit !== '') {
      const parsedSessionsLimit = Number(sessions_limit);
      if (!Number.isFinite(parsedSessionsLimit) || parsedSessionsLimit < 0) {
        return NextResponse.json({ error: 'Session limit must be zero or greater.' }, { status: 400 });
      }
      sessionsLimit = Math.floor(parsedSessionsLimit);
    }

    if (sessionsLimit != null) {
      const limitError = await validateChallengeSessionLimit(user.companyId, sessionsLimit);
      if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });
    }

    const startsAt = starts_at ? new Date(starts_at) : null;
    const endsAt = ends_at ? new Date(ends_at) : null;
    if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      return NextResponse.json({ error: 'Invalid assessment window date.' }, { status: 400 });
    }
    if (startsAt && endsAt && startsAt >= endsAt) {
      return NextResponse.json({ error: 'Assessment end time must be after the start time.' }, { status: 400 });
    }

    // Parse allowed_emails: accept array or comma-separated string
    const rawEmails: string[] = Array.isArray(allowed_emails)
      ? allowed_emails
      : typeof allowed_emails === 'string'
        ? allowed_emails.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
        : [];
    const allowedEmailsValue = rawEmails.length > 0 ? rawEmails : null;

    const focusAreasValue = Array.isArray(focus_areas) && focus_areas.length > 0
      ? focus_areas.join(', ')
      : typeof focus_areas === 'string' && focus_areas
        ? focus_areas
        : null;

    await sql`
      INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir, starter_files, sessions_limit, allowed_emails, starts_at, ends_at, role, tech_stack, seniority, focus_areas, context, cohort_label)
      VALUES (${id}, ${user.companyId}, ${title}, ${description}, ${timeLimit}, ${starterDir}, ${starterFiles}, ${sessionsLimit}, ${allowedEmailsValue}, ${startsAt ? startsAt.toISOString() : null}, ${endsAt ? endsAt.toISOString() : null}, ${role || null}, ${tech_stack || null}, ${seniority || null}, ${focusAreasValue}, ${context || null}, ${typeof cohort_label === 'string' && cohort_label.trim() ? cohort_label.trim() : null})
    `;

    const challenge = await getChallengeById(id);

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found after creation' }, { status: 500 });
    }

    // Ensure starter_files is a parsed array
    const parsedFiles = typeof challenge.starter_files === 'string'
      ? JSON.parse(challenge.starter_files)
      : challenge.starter_files;

    return NextResponse.json({ ...challenge, starter_files: parsedFiles }, { status: 201 });
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
