import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Session, SessionWithChallenge } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const OPENING_SYSTEM_PROMPT = `You are a senior technical interviewer opening a live software engineering assessment.
Greet the candidate warmly but briefly, acknowledge the challenge they're about to work on, and ask one sharp opening question that probes how they plan to approach it — trade-offs, data structures, or design choices.
Keep it to 2-3 sentences max. Do not give hints or solve the problem for them.`;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const [session] = await sql<SessionWithChallenge[]>`
      SELECT s.*, c.title as challenge_title, c.description as challenge_description
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;

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

    // Generate opening interviewer question in the background (non-blocking)
    generateOpeningQuestion(session.id, session.challenge_title, session.challenge_description).catch(
      (err) => console.error('Failed to generate opening interview question:', err)
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error starting session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateOpeningQuestion(sessionId: string, title: string, description: string) {
  const [seqRow] = await sql<{ max: number }[]>`
    SELECT COALESCE(MAX(sequence_num), 0) as max FROM interactions WHERE session_id = ${sessionId}
  `;
  const seq = (seqRow?.max ?? 0) + 1;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: OPENING_SYSTEM_PROMPT,
  });

  const prompt = `Challenge: ${title}\n\nProblem statement: ${description.slice(0, 800)}\n\nOpen the interview.`;
  const result = await model.generateContent(prompt);
  const greeting = result.response.text().trim();

  await sql`
    INSERT INTO interactions (session_id, sequence_num, timestamp, direction, content, content_type, metadata)
    VALUES (
      ${sessionId},
      ${seq},
      NOW(),
      'output',
      ${greeting},
      'interview_question',
      ${JSON.stringify({ trigger_type: 'session_start' })}::jsonb
    )
  `;
}
