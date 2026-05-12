import sql from '@/lib/db';
import { generateToken } from '@/lib/utils';
import { normalizeEmail, validateChallengeAccess } from '@/lib/challenge-access';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Challenge } from '@/types';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type SessionCreationResult = {
  body: Record<string, unknown>;
  status?: number;
};

// Public endpoint: candidates self-register for a challenge.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const challenge = await getChallengeById(id);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const { candidate_name, candidate_email } = await request.json();

    if (!candidate_name || !candidate_email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(String(candidate_email));
    const candidateName = String(candidate_name).trim();
    if (!candidateName || !normalizedEmail) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const access = await validateChallengeAccess(challenge, {
      candidateEmail: normalizedEmail,
      enforceEmailAllowlist: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, reason: access.reason }, { status: access.status });
    }

    const result = await sql.begin(async (tx): Promise<SessionCreationResult> => {
      const trx = tx as unknown as typeof sql;

      await trx`SELECT pg_advisory_xact_lock(hashtext(${challenge.company_id}))`;
      await trx`SELECT pg_advisory_xact_lock(hashtext(${challenge.id}))`;

      const lockedChallenge = await getChallengeById(id);
      if (!lockedChallenge) {
        return { body: { error: 'Challenge not found' }, status: 404 };
      }

      const lockedAccess = await validateChallengeAccess(lockedChallenge, {
        candidateEmail: normalizedEmail,
        enforceEmailAllowlist: true,
      });
      if (!lockedAccess.ok) {
        return {
          body: { error: lockedAccess.message, reason: lockedAccess.reason },
          status: lockedAccess.status,
        };
      }

      // Check if this candidate already has any session for this challenge.
      const [existing] = await trx`
        SELECT token, status FROM sessions
        WHERE challenge_id = ${id} AND LOWER(TRIM(candidate_email)) = ${normalizedEmail}
        ORDER BY created_at DESC LIMIT 1
      `;

      if (existing) {
        if (existing.status === 'pending' || existing.status === 'active') {
          return { body: { token: existing.token, invite_url: `/session/${existing.token}` } };
        }
        if (existing.status === 'queued' || existing.status === 'analyzing') {
          return {
            body: { error: 'Your assessment has been submitted and is currently being evaluated.' },
            status: 403,
          };
        }
        return {
          body: { error: 'You have already completed this assessment. Each candidate may only attempt it once.' },
          status: 403,
        };
      }

      const creationAccess = await validateChallengeAccess(lockedChallenge, {
        enforceCapacity: true,
        enforcePlanQuota: true,
        db: trx,
      });
      if (!creationAccess.ok) {
        return {
          body: { error: creationAccess.message, reason: creationAccess.reason },
          status: creationAccess.status,
        };
      }

      const sessionId = uuidv4();
      const token = generateToken();

      await trx`
        INSERT INTO sessions (id, challenge_id, candidate_name, candidate_email, token)
        VALUES (${sessionId}, ${id}, ${candidateName}, ${normalizedEmail}, ${token})
      `;

      return { body: { token, invite_url: `/session/${token}` }, status: 201 };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Error creating public session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Public endpoint: returns challenge info for the apply page.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [challenge] = await sql<Challenge[]>`
      SELECT id, title, description, time_limit_min, company_id, is_active, sessions_limit, allowed_emails, starts_at, ends_at, starter_files_dir, starter_files, role, tech_stack, seniority, focus_areas, context, created_at
      FROM challenges WHERE id = ${id}
    `;

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const [company] = await sql`SELECT name FROM companies WHERE id = ${challenge.company_id}`;
    const access = await validateChallengeAccess(challenge);

    return NextResponse.json({
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      time_limit_min: challenge.time_limit_min,
      company_name: company?.name || 'Unknown',
      starts_at: challenge.starts_at,
      ends_at: challenge.ends_at,
      availability: access.ok
        ? { ok: true, reason: 'ok', message: 'OK' }
        : { ok: false, reason: access.reason, message: access.message },
    });
  } catch (error) {
    console.error('Error fetching challenge for apply:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
