import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const INTERVIEWER_SYSTEM_PROMPT = `You are a senior technical interviewer conducting a live software engineering assessment.
Your role is to probe the candidate's thinking — ask about trade-offs, design decisions, scalability, and first principles.
You are watching the candidate work in real time.

SCOPE RULES (strictly enforced):
- You may discuss: the problem statement, technical approaches, trade-offs, scalability, data structures, algorithms, design patterns, and engineering best practices relevant to the problem.
- You may NOT: reveal how the candidate is being scored, discuss assessment mechanics, give implementation hints, or solve the problem for them.
- If asked about scoring or assessment: respond with exactly "I can only discuss the technical problem and engineering trade-offs. Claude Code in your terminal has context about the challenge itself."
- If asked something off-topic: gently redirect to the technical problem.

Keep responses concise (2-4 sentences max). Sound like a thoughtful senior engineer, not a chatbot. Be warm but direct.`;

// POST /api/sessions/[token]/interview/message
// Body: { content: string; replyToSeq?: number }
// Stores candidate message, calls Gemini, stores AI reply, returns reply.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { content, replyToSeq } = await request.json();

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const trimmed = content.trim().slice(0, 2000);

    // Fetch session + challenge
    const [session] = await sql<{ id: string; status: string; challenge_description: string; challenge_title: string }[]>`
      SELECT s.id, s.status, c.description as challenge_description, c.title as challenge_title
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      WHERE s.token = ${token}
    `;
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 });
    }

    // Fetch conversation history (last 10 interview exchanges)
    const history = await sql<{ direction: string; content: string; content_type: string }[]>`
      SELECT direction, content, content_type
      FROM interactions
      WHERE session_id = ${session.id}
        AND content_type IN ('interview_question', 'interview_response')
      ORDER BY sequence_num DESC
      LIMIT 10
    `;
    const historyAsc = [...history].reverse();

    // Determine next sequence number
    const [seqRow] = await sql<{ max: number }[]>`
      SELECT COALESCE(MAX(sequence_num), 0) as max FROM interactions WHERE session_id = ${session.id}
    `;
    let nextSeq = (seqRow?.max ?? 0) + 1;

    // Store candidate message as interview_response
    const [inserted] = await sql<{ sequence_num: number }[]>`
      INSERT INTO interactions (session_id, sequence_num, timestamp, direction, content, content_type, metadata)
      VALUES (
        ${session.id},
        ${nextSeq},
        NOW(),
        'input',
        ${trimmed},
        'interview_response',
        ${JSON.stringify({ reply_to_seq: replyToSeq ?? null })}::jsonb
      )
      RETURNING sequence_num
    `;
    nextSeq = inserted.sequence_num + 1;

    // Build conversation for Gemini
    const conversationParts: string[] = [
      `Challenge: ${session.challenge_title}`,
      `Problem statement: ${session.challenge_description.slice(0, 800)}`,
      '',
      '--- Conversation history ---',
    ];
    for (const h of historyAsc) {
      const role = h.content_type === 'interview_question' ? 'Interviewer' : 'Candidate';
      conversationParts.push(`${role}: ${h.content}`);
    }
    conversationParts.push(`Candidate: ${trimmed}`);
    conversationParts.push('');
    conversationParts.push('Respond as the interviewer. Follow the scope rules strictly.');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: INTERVIEWER_SYSTEM_PROMPT,
    });

    const result = await model.generateContent(conversationParts.join('\n'));
    const aiReply = result.response.text().trim();

    // Store AI reply as interview_question
    await sql`
      INSERT INTO interactions (session_id, sequence_num, timestamp, direction, content, content_type, metadata)
      VALUES (
        ${session.id},
        ${nextSeq},
        NOW(),
        'output',
        ${aiReply},
        'interview_question',
        ${JSON.stringify({ trigger_type: 'candidate_message' })}::jsonb
      )
    `;

    return NextResponse.json({ reply: aiReply, sequence_num: nextSeq });
  } catch (error) {
    console.error('Error processing interview message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
