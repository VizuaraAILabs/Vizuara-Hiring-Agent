import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { AnalysisResult, Session, Challenge } from '@/types';

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

    if (session.status === 'queued' || session.status === 'analyzing') {
      return NextResponse.json({ status: 'already_running', session_id: sessionId }, { status: 202 });
    }

    if (session.status !== 'completed') {
      return NextResponse.json({ error: 'Session must be completed before analysis' }, { status: 400 });
    }

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';

    const analysisResponse = await fetch(`${engineUrl}/analyze/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!analysisResponse.ok) {
      const errorBody = await analysisResponse.text();
      console.error('Analysis engine error:', errorBody);
      return NextResponse.json({ error: 'Analysis engine failed' }, { status: 502 });
    }

    const analysisData = await analysisResponse.json();
    return NextResponse.json(analysisData, { status: 202 });
  } catch (error) {
    console.error('Error triggering analysis:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
