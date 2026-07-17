import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

interface AdminSessionEnding {
  session_id: string;
  challenge_id: string;
  challenge_title: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const endings = await sql<AdminSessionEnding[]>`
      SELECT
        s.id AS session_id,
        s.challenge_id,
        c.title AS challenge_title,
        co.name AS company_name,
        s.candidate_name,
        s.candidate_email,
        s.status,
        s.started_at,
        s.ended_at,
        s.end_reason
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE s.end_reason IS NOT NULL
      ORDER BY s.ended_at DESC NULLS LAST
      LIMIT 200
    `;

    return NextResponse.json({ endings });
  } catch (error) {
    console.error('Admin session endings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
