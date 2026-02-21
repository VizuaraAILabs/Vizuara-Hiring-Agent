import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import type { Session } from '@/types';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE token = ${token}`;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'pending') {
      return NextResponse.json({ error: 'Session has already been started' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const [updated] = await sql<Session[]>`
      UPDATE sessions SET status = 'active', started_at = ${now} WHERE id = ${session.id} RETURNING *
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error starting session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
