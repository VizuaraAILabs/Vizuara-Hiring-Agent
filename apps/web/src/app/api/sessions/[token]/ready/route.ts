import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { databaseUnavailableResponse, isDatabaseConnectionError } from '@/lib/api-errors';
import { candidateUnavailablePayload } from '@/lib/candidate-unavailable';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { callWithKeyRotation } from '@/lib/gemini';
import type { Session, SessionWithChallenge } from '@/types';

type CandidateSessionWithChallenge = Omit<
  SessionWithChallenge,
  'decision_label' | 'recruiter_notes' | 'reviewed_by_email' | 'reviewed_by_name' | 'reviewed_at'
>;

type CandidateSessionUpdate = Pick<
  Session,
  'id' | 'challenge_id' | 'candidate_name' | 'candidate_email' | 'token' | 'status' | 'started_at' | 'ended_at' | 'created_at' | 'workspace_snapshot' | 'candidate_lifecycle_status'
>;

const OPENING_SYSTEM_PROMPT = `You are a senior technical interviewer opening a live software engineering assessment.
Greet the candidate warmly but briefly, acknowledge the challenge they're about to work on, and ask one sharp opening question that probes how they plan to approach it - trade-offs, data structures, or design choices.
Keep it to 2-3 sentences max. Do not give hints or solve the problem for them.`;

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<CandidateSessionWithChallenge[]>`
      SELECT
        s.id, s.challenge_id, s.candidate_name, s.candidate_email, s.token, s.status,
        s.started_at, s.ended_at, s.created_at, s.workspace_snapshot, s.candidate_lifecycle_status,
        c.title as challenge_title, c.description as challenge_description
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

    if (!session) {
      return NextResponse.json(candidateUnavailablePayload('invalid_link'), { status: 404 });
    }
    if (session.candidate_lifecycle_status) {
      return NextResponse.json(candidateUnavailablePayload('revoked'), { status: 403 });
    }

    if (session.status === 'active' && session.started_at) {
      return NextResponse.json(session);
    }
    if (session.status !== 'pending' && session.status !== 'active') {
      return NextResponse.json(candidateUnavailablePayload('session_not_active'), { status: 400 });
    }

    const now = new Date().toISOString();
    const [updated] = await sql<CandidateSessionUpdate[]>`
      UPDATE sessions
      SET status = 'active', started_at = ${now}
      WHERE id = ${session.id}
        AND started_at IS NULL
        AND status = 'pending'
        AND candidate_lifecycle_status IS NULL
      RETURNING
        id, challenge_id, candidate_name, candidate_email, token, status,
        started_at, ended_at, created_at, workspace_snapshot, candidate_lifecycle_status
    `;
    if (!updated) {
      return NextResponse.json(candidateUnavailablePayload('session_not_active'), { status: 409 });
    }

    generateOpeningQuestion(session.id, session.challenge_title, session.challenge_description).catch(
      (err) => console.error('Failed to generate opening interview question:', err)
    );

    return NextResponse.json({ ...session, ...updated });
  } catch (error) {
    console.error('Error marking session ready:', error);
    if (isDatabaseConnectionError(error)) return databaseUnavailableResponse();
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateOpeningQuestion(sessionId: string, title: string, description: string) {
  const [seqRow] = await sql<{ max: number }[]>`
    SELECT COALESCE(MAX(sequence_num), 0) as max FROM interactions WHERE session_id = ${sessionId}
  `;
  const seq = (seqRow?.max ?? 0) + 1;

  const prompt = `Challenge: ${title}\n\nProblem statement: ${description.slice(0, 800)}\n\nOpen the interview.`;
  const greeting = await callWithKeyRotation(async key => {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: OPENING_SYSTEM_PROMPT,
    });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  });

  await sql`
    INSERT INTO interactions (session_id, sequence_num, timestamp, direction, content, content_type, metadata)
    VALUES (
      ${sessionId},
      ${seq},
      NOW(),
      'output',
      ${greeting},
      'interview_question',
      ${JSON.stringify({ trigger_type: 'session_ready' })}::jsonb
    )
  `;
}
