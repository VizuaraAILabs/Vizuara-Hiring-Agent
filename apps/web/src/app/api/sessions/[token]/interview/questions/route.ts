import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// GET /api/sessions/[token]/interview/questions?after=<sequence_num>
// Returns interview_question and interview_response interactions after the given sequence_num.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const url = new URL(request.url);
    const after = parseInt(url.searchParams.get('after') || '0', 10);

    const [session] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM sessions WHERE token = ${token}
    `;
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const interactions = await sql<{
      id: number;
      sequence_num: number;
      timestamp: string;
      direction: string;
      content: string;
      content_type: string;
      metadata: string;
    }[]>`
      SELECT id, sequence_num, timestamp, direction, content, content_type, metadata
      FROM interactions
      WHERE session_id = ${session.id}
        AND content_type IN ('interview_question', 'interview_response')
        AND sequence_num > ${after}
      ORDER BY sequence_num ASC
    `;

    return NextResponse.json({ interactions });
  } catch (error) {
    console.error('Error fetching interview questions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
