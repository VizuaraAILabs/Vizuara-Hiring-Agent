import sql from '@/lib/db';
import { checkEnrollmentStatus } from '@/lib/enrollment';
import { isAdmin } from '@/lib/auth';
import { generateToken } from '@/lib/utils';
import type { Challenge } from '@/types';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Public endpoint — no auth required. Candidates self-register for a challenge.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${id}`;
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const { candidate_name, candidate_email } = await request.json();

    if (!candidate_name || !candidate_email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Allowlist check — if set, only allowed emails may proceed
    if (Array.isArray(challenge.allowed_emails) && challenge.allowed_emails.length > 0) {
      const normalizedInput = candidate_email.trim().toLowerCase();
      const allowed = challenge.allowed_emails.map((e: string) => e.trim().toLowerCase());
      if (!allowed.includes(normalizedInput)) {
        return NextResponse.json(
          { error: 'Only invited participants are allowed to attempt the assessment.' },
          { status: 403 }
        );
      }
    }

    // Check if this candidate already has any session for this challenge
    const [existing] = await sql`
      SELECT token, status FROM sessions
      WHERE challenge_id = ${id} AND candidate_email = ${candidate_email}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (existing) {
      if (existing.status === 'pending' || existing.status === 'active') {
        // Return existing session token so they can resume
        return NextResponse.json({ token: existing.token, invite_url: `/session/${existing.token}` });
      }
      if (existing.status === 'analyzing') {
        return NextResponse.json(
          { error: 'Your assessment has been submitted and is currently being evaluated.' },
          { status: 403 }
        );
      }
      // Already completed or analyzed — block reattempt
      return NextResponse.json(
        { error: 'You have already completed this assessment. Each candidate may only attempt it once.' },
        { status: 403 }
      );
    }

    // Look up the company email to determine if this is an admin-created challenge
    const [company] = await sql<{ email: string }[]>`SELECT email FROM companies WHERE id = ${challenge.company_id}`;
    const isAdminChallenge = company ? isAdmin(company.email) : false;

    if (isAdminChallenge) {
      // For admin challenges: enforce per-challenge sessions_limit if set, otherwise unlimited
      if (challenge.sessions_limit != null) {
        const [{ count }] = await sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count FROM sessions WHERE challenge_id = ${id}
        `;
        if (count >= challenge.sessions_limit) {
          return NextResponse.json(
            { error: 'This assessment has reached its maximum number of participants.' },
            { status: 403 }
          );
        }
      }
    } else {
      // For regular companies: enforce plan quotas
      const planStatus = await checkEnrollmentStatus(challenge.company_id);
      if (!planStatus.canCreateSession) {
        // Candidates see a generic message — never expose payment details
        return NextResponse.json(
          { error: 'This assessment is temporarily unavailable. Please contact the company.' },
          { status: 403 }
        );
      }
    }

    const sessionId = uuidv4();
    const token = generateToken();

    await sql`
      INSERT INTO sessions (id, challenge_id, candidate_name, candidate_email, token)
      VALUES (${sessionId}, ${id}, ${candidate_name}, ${candidate_email}, ${token})
    `;

    return NextResponse.json({ token, invite_url: `/session/${token}` }, { status: 201 });
  } catch (error) {
    console.error('Error creating public session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Public endpoint — returns challenge info for the apply page (no auth)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [challenge] = await sql`
      SELECT id, title, description, time_limit_min, company_id FROM challenges WHERE id = ${id}
    `;

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // Get company name for branding
    const [company] = await sql`SELECT name FROM companies WHERE id = ${challenge.company_id}`;

    return NextResponse.json({
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      time_limit_min: challenge.time_limit_min,
      company_name: company?.name || 'Unknown',
    });
  } catch (error) {
    console.error('Error fetching challenge for apply:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
