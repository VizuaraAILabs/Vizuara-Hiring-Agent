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

    const [row] = await sql<{ transcript_narrative: string | null }[]>`
      SELECT transcript_narrative FROM analysis_results WHERE session_id = ${sessionId}
    `;

    return NextResponse.json({ transcript_narrative: row?.transcript_narrative ?? null });
  } catch (error) {
    console.error('Error fetching transcript narrative:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await params;
    const session = await verifyAccess(sessionId, user.sub);
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';

    const res = await fetch(`${engineUrl}/analyze/transcript-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('Analysis engine error:', errorBody);
      return NextResponse.json({ error: 'Failed to generate narrative' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error generating transcript narrative:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
