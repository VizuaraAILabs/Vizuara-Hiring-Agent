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

const TRANSCRIPT_NARRATIVE_TIMEOUT_MS = 120_000;

async function verifyAccess(sessionId: string, userId: string) {
  const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
  if (!session) return null;

  const challenge = await getChallengeById(session.challenge_id);
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
    if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });

    const { sessionId } = await params;
    const session = await verifyAccess(sessionId, user.companyId);
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
    if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });

    const { sessionId } = await params;
    const session = await verifyAccess(sessionId, user.companyId);
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const engineUrl = process.env.ANALYSIS_ENGINE_URL || 'http://localhost:8000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIPT_NARRATIVE_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${engineUrl}/analyze/transcript-narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        await recordAnalysisFailure(
          sessionId,
          'transcript_narrative_timeout',
          'Transcript narrative generation timed out',
          { timeout_ms: TRANSCRIPT_NARRATIVE_TIMEOUT_MS },
        );
        return NextResponse.json(
          {
            error: 'Transcript narrative generation timed out. Please retry.',
            code: 'transcript_narrative_timeout',
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
      logAnalysisEngineError('Analysis engine narrative error', engineError, { sessionId });
      return analysisErrorResponse(engineError);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error generating transcript narrative:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
