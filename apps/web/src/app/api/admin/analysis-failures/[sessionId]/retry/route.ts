import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { recordAnalysisFailure } from '@/lib/analysis-failure-log';
import {
  analysisErrorResponse,
  logAnalysisEngineError,
  parseAnalysisEngineError,
} from '@/lib/analysis-engine-errors';

const ANALYSIS_RETRY_START_TIMEOUT_MS = 20_000;

interface SessionRow {
  id: string;
  status: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { sessionId } = await params;
    const [session] = await sql<SessionRow[]>`
      SELECT id, status
      FROM sessions
      WHERE id = ${sessionId}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'queued' || session.status === 'analyzing') {
      return NextResponse.json({ status: 'already_running', session_id: sessionId }, { status: 202 });
    }

    if (session.status !== 'analysis failed') {
      return NextResponse.json(
        { error: 'Only sessions with failed analysis can be retried here.' },
        { status: 400 },
      );
    }

    const [existingAnalysis] = await sql<{ id: string }[]>`
      SELECT id
      FROM analysis_results
      WHERE session_id = ${sessionId}
      LIMIT 1
    `;
    if (existingAnalysis) {
      await sql`UPDATE sessions SET status = 'analyzed' WHERE id = ${sessionId}`;
      return NextResponse.json({
        status: 'already_analyzed',
        analysis_id: existingAnalysis.id,
        session_id: sessionId,
      });
    }

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYSIS_RETRY_START_TIMEOUT_MS);

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
        const [latestSession] = await sql<SessionRow[]>`
          SELECT id, status
          FROM sessions
          WHERE id = ${sessionId}
        `;
        if (latestSession?.status === 'queued' || latestSession?.status === 'analyzing') {
          return NextResponse.json({ status: 'already_running', session_id: sessionId }, { status: 202 });
        }

        await recordAnalysisFailure(
          sessionId,
          'analysis_start_timeout',
          'Analysis engine timed out while starting analysis',
          { timeout_ms: ANALYSIS_RETRY_START_TIMEOUT_MS, source: 'admin_retry' },
        );

        return NextResponse.json(
          {
            error: 'Analysis took too long to start. Please retry.',
            code: 'analysis_start_timeout',
            retryable: true,
          },
          { status: 504 },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!analysisResponse.ok) {
      const errorBody = await analysisResponse.text();
      const engineError = parseAnalysisEngineError(analysisResponse.status, errorBody);
      logAnalysisEngineError('Admin analysis retry start error', engineError, { sessionId });
      return analysisErrorResponse(engineError);
    }

    const analysisData = await analysisResponse.json();
    return NextResponse.json(analysisData, { status: 202 });
  } catch (error) {
    console.error('Admin analysis retry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
