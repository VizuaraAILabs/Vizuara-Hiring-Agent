import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { AnalysisResult, Session, Challenge } from '@/types';

function isFetchTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { name?: string; cause?: unknown };
  if (maybeError.name === 'TimeoutError') return true;

  const cause = maybeError.cause;
  if (cause && typeof cause === 'object') {
    const maybeCause = cause as { code?: string; name?: string };
    return (
      maybeCause.code === 'UND_ERR_HEADERS_TIMEOUT' ||
      maybeCause.name === 'HeadersTimeoutError'
    );
  }

  return false;
}

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;

    const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${session.challenge_id}`;
    if (!challenge || challenge.company_id !== user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [analysis] = await sql<AnalysisResult[]>`SELECT * FROM analysis_results WHERE session_id = ${sessionId}`;
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // With JSONB columns, postgres.js auto-parses JSON — no manual JSON.parse needed
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Error fetching analysis:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;

    const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${session.challenge_id}`;
    if (!challenge || challenge.company_id !== user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status !== 'completed') {
      return NextResponse.json({ error: 'Session must be completed before analysis' }, { status: 400 });
    }

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';

    const analysisResponse = await fetch(`${engineUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (!analysisResponse.ok) {
      const errorBody = await analysisResponse.text();
      console.error('Analysis engine error:', errorBody);
      return NextResponse.json({ error: 'Analysis engine failed' }, { status: 502 });
    }

    const analysisData = await analysisResponse.json();

    // Update session status to analyzed
    await sql`UPDATE sessions SET status = 'analyzed' WHERE id = ${sessionId}`;

    return NextResponse.json(analysisData);
  } catch (error) {
    console.error('Error triggering analysis:', error);
    if (isFetchTimeout(error)) {
      return NextResponse.json(
        {
          error: 'Analysis timed out and was cancelled. Please try again.',
        },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
