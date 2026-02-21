import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { generateToken } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { Challenge } from '@/types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${id}`;

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { candidate_name, candidate_email } = await request.json();

    if (!candidate_name || !candidate_email) {
      return NextResponse.json({ error: 'Candidate name and email are required' }, { status: 400 });
    }

    const sessionId = uuidv4();
    const token = generateToken();

    await sql`
      INSERT INTO sessions (id, challenge_id, candidate_name, candidate_email, token)
      VALUES (${sessionId}, ${id}, ${candidate_name}, ${candidate_email}, ${token})
    `;

    return NextResponse.json({ token, invite_url: `/session/${token}` }, { status: 201 });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
