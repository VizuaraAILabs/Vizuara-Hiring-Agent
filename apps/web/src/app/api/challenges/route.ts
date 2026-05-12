import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { validateChallengeSessionLimit } from '@/lib/challenge-settings';
import { getChallengeById } from '@/lib/challenge-queries';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

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
        c.created_at,
        COUNT(s.id)::int as candidate_count
      FROM challenges c
      LEFT JOIN sessions s ON s.challenge_id = c.id
      WHERE c.company_id = ${user.companyId}
      GROUP BY c.id
      ORDER BY c.created_at DESC
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

    const { title, description, time_limit_min, starter_files_dir, starter_files, sessions_limit, allowed_emails, starts_at, ends_at, role, tech_stack, seniority, focus_areas, context } = await request.json();

    if (!title || !description) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const id = uuidv4();
    const timeLimit = Math.max(10, Math.min(45, time_limit_min || 30));
    const starterDir = starter_files_dir || null;
    const starterFiles = Array.isArray(starter_files) && starter_files.length > 0
      ? JSON.stringify(starter_files)
      : null;
    const sessionsLimit = sessions_limit != null && sessions_limit !== ''
      ? Math.max(1, parseInt(sessions_limit) || 1)
      : null;

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
      INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir, starter_files, sessions_limit, allowed_emails, starts_at, ends_at, role, tech_stack, seniority, focus_areas, context)
      VALUES (${id}, ${user.companyId}, ${title}, ${description}, ${timeLimit}, ${starterDir}, ${starterFiles}, ${sessionsLimit}, ${allowedEmailsValue}, ${startsAt ? startsAt.toISOString() : null}, ${endsAt ? endsAt.toISOString() : null}, ${role || null}, ${tech_stack || null}, ${seniority || null}, ${focusAreasValue}, ${context || null})
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
