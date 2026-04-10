import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { callWithKeyRotation } from '@/lib/gemini';

const QUESTION_GENERATION_PROMPT = `You are a senior technical interviewer watching a candidate solve a programming challenge in real time.
Based on what the candidate just did (shown below), generate ONE focused question.

Your question should:
- Ask about a trade-off, design decision, or scalability concern
- Probe WHY they chose this approach over alternatives
- Be specific to what they just did, not generic
- Be concise (1-2 sentences max)
- Sound natural, like a thoughtful interviewer — not a quiz

DO NOT ask questions the candidate can't answer without running code.
DO NOT ask about the assessment process or scoring.
If the recent activity is too trivial to warrant a meaningful question, respond with exactly: NO_QUESTION`;

// POST /api/sessions/[token]/interview/trigger
// Called by the terminal server's ActivityMonitor when a trigger event fires.
// Body: { recentActivity: string[]; triggerType: string; sessionId: string }
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { recentActivity, triggerType } = await request.json();

    // Fetch session + challenge
    const [session] = await sql<{ id: string; status: string; challenge_description: string; challenge_title: string }[]>`
      SELECT s.id, s.status, c.description as challenge_description, c.title as challenge_title
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;
    if (!session || session.status !== 'active') {
      return NextResponse.json({ ok: false, reason: 'session not active' });
    }

    // Check how many AI-initiated questions have already been asked this session
    const [countRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM interactions
      WHERE session_id = ${session.id}
        AND content_type = 'interview_question'
        AND metadata->>'trigger_type' != 'candidate_message'
    `;
    const MAX_QUESTIONS = 6;
    if ((countRow?.count ?? 0) >= MAX_QUESTIONS) {
      return NextResponse.json({ ok: false, reason: 'max questions reached' });
    }

    // Fetch last few interview exchanges for context
    const history = await sql<{ direction: string; content: string; content_type: string }[]>`
      SELECT direction, content, content_type
      FROM interactions
      WHERE session_id = ${session.id}
        AND content_type IN ('interview_question', 'interview_response')
      ORDER BY sequence_num DESC
      LIMIT 6
    `;
    const historyAsc = [...history].reverse();

    // Build context for Gemini
    const contextParts: string[] = [
      `Challenge: ${session.challenge_title}`,
      `Problem: ${session.challenge_description.slice(0, 600)}`,
      '',
      `Trigger event: ${triggerType}`,
      '',
      'Recent candidate activity:',
      ...(Array.isArray(recentActivity) ? recentActivity.slice(-15).map((a: string) => `  > ${a}`) : []),
    ];

    if (historyAsc.length > 0) {
      contextParts.push('');
      contextParts.push('Previous interview exchanges:');
      for (const h of historyAsc) {
        const role = h.content_type === 'interview_question' ? 'Interviewer' : 'Candidate';
        contextParts.push(`  ${role}: ${h.content.slice(0, 200)}`);
      }
    }

    const question = await callWithKeyRotation(async key => {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: QUESTION_GENERATION_PROMPT,
      });
      const result = await model.generateContent(contextParts.join('\n'));
      return result.response.text().trim();
    });

    if (!question || question === 'NO_QUESTION') {
      return NextResponse.json({ ok: true, generated: false });
    }

    // Determine next sequence number
    const [seqRow] = await sql<{ max: number }[]>`
      SELECT COALESCE(MAX(sequence_num), 0) as max FROM interactions WHERE session_id = ${session.id}
    `;
    const nextSeq = (seqRow?.max ?? 0) + 1;

    await sql`
      INSERT INTO interactions (session_id, sequence_num, timestamp, direction, content, content_type, metadata)
      VALUES (
        ${session.id},
        ${nextSeq},
        NOW(),
        'output',
        ${question},
        'interview_question',
        ${JSON.stringify({ trigger_type: triggerType })}::jsonb
      )
    `;

    return NextResponse.json({ ok: true, generated: true, question });
  } catch (error) {
    console.error('Error generating interview question:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
