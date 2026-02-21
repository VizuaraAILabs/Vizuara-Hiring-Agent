import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await params;

    // Find the session and verify it belongs to the authenticated company
    const [session] = await sql<{ session_id: string }[]>`
      SELECT s.id as session_id FROM sessions s
      JOIN challenges c ON s.challenge_id = c.id
      WHERE s.token = ${token} AND c.company_id = ${user.sub}
    `;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const interactions = await sql`
      SELECT * FROM interactions WHERE session_id = ${session.session_id} ORDER BY sequence_num ASC
    `;

    return NextResponse.json(interactions);
  } catch (error) {
    console.error('Error fetching interactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
