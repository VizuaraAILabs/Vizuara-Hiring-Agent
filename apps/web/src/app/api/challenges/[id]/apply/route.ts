import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { generateToken } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { Challenge } from '@/types';

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

    // Check if this candidate already has a pending/active session for this challenge
    const [existing] = await sql`
      SELECT token, status FROM sessions
      WHERE challenge_id = ${id} AND candidate_email = ${candidate_email}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (existing && (existing.status === 'pending' || existing.status === 'active')) {
      // Return existing session token so they can resume
      return NextResponse.json({ token: existing.token, invite_url: `/session/${existing.token}` });
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
