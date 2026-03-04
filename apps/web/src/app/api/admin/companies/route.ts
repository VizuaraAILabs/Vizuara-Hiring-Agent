import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const companies = await sql`
      SELECT
        c.id,
        c.name,
        c.email,
        c.plan,
        c.trial_ends_at,
        c.created_at,
        COUNT(DISTINCT ch.id)::int AS challenge_count,
        COUNT(DISTINCT s.id)::int AS total_sessions,
        COUNT(DISTINCT CASE WHEN s.status IN ('pending', 'active') THEN s.id END)::int AS pending_sessions
      FROM companies c
      LEFT JOIN challenges ch ON ch.company_id = c.id
      LEFT JOIN sessions s ON s.challenge_id = ch.id
      GROUP BY c.id, c.name, c.email, c.plan, c.trial_ends_at, c.created_at
      ORDER BY c.created_at DESC
    `;

    return NextResponse.json({ companies });
  } catch (error) {
    console.error('Admin companies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
