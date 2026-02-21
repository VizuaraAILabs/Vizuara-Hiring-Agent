import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { Challenge, Session } from '@/types';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const sessions = await sql<Session[]>`
      SELECT * FROM sessions WHERE challenge_id = ${id} ORDER BY created_at DESC
    `;

    return NextResponse.json({ ...challenge, sessions });
  } catch (error) {
    console.error('Error fetching challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
