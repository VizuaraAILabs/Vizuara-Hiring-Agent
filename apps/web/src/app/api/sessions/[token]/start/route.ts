import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import type { Session, SessionWithChallenge } from '@/types';

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<SessionWithChallenge[]>`
      SELECT s.*, c.title as challenge_title, c.description as challenge_description
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'pending') {
      return NextResponse.json({ error: 'Session has already been started' }, { status: 400 });
    }

    const [updated] = await sql<Session[]>`
      UPDATE sessions SET status = 'active' WHERE id = ${session.id} RETURNING *
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error starting session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
