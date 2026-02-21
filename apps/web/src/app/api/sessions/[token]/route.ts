import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import type { SessionWithChallenge } from '@/types';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<SessionWithChallenge[]>`
      SELECT s.*, c.title as challenge_title, c.description as challenge_description, c.time_limit_min
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
