import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { Session, Challenge } from '@/types';

async function verifyAccess(sessionId: string, userId: string) {
  const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
  if (!session) return null;

  const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${session.challenge_id}`;
  if (!challenge || challenge.company_id !== userId) return null;

  return session;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await params;
    const session = await verifyAccess(sessionId, user.sub);
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (session.status === 'pending' || session.status === 'active') {
      return NextResponse.json({ error: 'Session is still in progress' }, { status: 409 });
    }

    const [row] = await sql<{ workspace_snapshot: unknown }[]>`
      SELECT workspace_snapshot FROM sessions WHERE id = ${sessionId}
    `;

    if (!row?.workspace_snapshot) {
      return NextResponse.json({ error: 'No workspace snapshot available for this session' }, { status: 404 });
    }

    return NextResponse.json(row.workspace_snapshot);
  } catch (error) {
    console.error('Error fetching workspace snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
