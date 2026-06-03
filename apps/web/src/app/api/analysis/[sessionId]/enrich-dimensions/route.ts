import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { recordAnalysisFailure } from '@/lib/analysis-failure-log';
import {
  analysisErrorResponse,
  logAnalysisEngineError,
  parseAnalysisEngineError,
} from '@/lib/analysis-engine-errors';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Session } from '@/types';

const ENRICH_DIMENSIONS_TIMEOUT_MS = 90_000;

async function verifyAccess(sessionId: string, userId: string) {
  const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
  if (!session) return null;

  const challenge = await getChallengeById(session.challenge_id);
  if (!challenge || challenge.company_id !== userId) return null;

  return session;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });

    const { sessionId } = await params;
    const session = await verifyAccess(sessionId, user.companyId);
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENRICH_DIMENSIONS_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${engineUrl}/analyze/enrich-dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        await recordAnalysisFailure(
          sessionId,
          'enrich_dimensions_timeout',
          'Detailed evidence generation timed out',
          { timeout_ms: ENRICH_DIMENSIONS_TIMEOUT_MS },
        );
        return NextResponse.json(
          {
            error: 'Detailed evidence generation timed out. Please retry.',
            code: 'enrich_dimensions_timeout',
            retryable: true,
          },
          { status: 504 },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const errorBody = await res.text();
      const engineError = parseAnalysisEngineError(res.status, errorBody);
      logAnalysisEngineError('Analysis engine enrichment error', engineError, { sessionId });
      return analysisErrorResponse(engineError);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error enriching dimension evidence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
