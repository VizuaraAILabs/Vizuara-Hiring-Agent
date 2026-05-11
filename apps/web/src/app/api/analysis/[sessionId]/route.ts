import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { recordAnalysisFailure } from '@/lib/analysis-failure-log';
import type { AnalysisResult, Session, Challenge } from '@/types';

const ANALYSIS_START_TIMEOUT_MS = 20_000;

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { sessionId } = await params;

    const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${session.challenge_id}`;
    if (!challenge || challenge.company_id !== user.companyId) {
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
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { sessionId } = await params;

    const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${session.challenge_id}`;
    if (!challenge || challenge.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status === 'queued' || session.status === 'analyzing') {
      return NextResponse.json({ status: 'already_running', session_id: sessionId }, { status: 202 });
    }

    if (session.status !== 'completed' && session.status !== 'analysis failed') {
      return NextResponse.json({ error: 'Session must be completed or have a failed analysis before retrying' }, { status: 400 });
    }

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYSIS_START_TIMEOUT_MS);

    let analysisResponse: Response;
    try {
      analysisResponse = await fetch(`${engineUrl}/analyze/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const [latestSession] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
        if (latestSession?.status === 'queued' || latestSession?.status === 'analyzing') {
          return NextResponse.json({ status: 'already_running', session_id: sessionId }, { status: 202 });
        }
        await recordAnalysisFailure(
          sessionId,
          'analysis_start_timeout',
          'Analysis engine timed out while starting analysis',
          { timeout_ms: ANALYSIS_START_TIMEOUT_MS },
        );
        return NextResponse.json({ error: 'Analysis engine timed out while starting analysis' }, { status: 504 });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

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
