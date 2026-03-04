import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const filterCompany = url.searchParams.get('company_id');
    const filterOwner = url.searchParams.get('owner'); // 'admin' = only admin's own challenges

    let challenges;

    if (filterOwner === 'admin') {
      challenges = await sql`
        SELECT
          ch.id, ch.company_id, ch.title, ch.description,
          ch.time_limit_min, ch.is_active, ch.created_at,
          co.name AS company_name,
          COUNT(s.id)::int AS candidate_count
        FROM challenges ch
        JOIN companies co ON co.id = ch.company_id
        LEFT JOIN sessions s ON s.challenge_id = ch.id
        WHERE ch.company_id = ${user.sub}
        GROUP BY ch.id, ch.company_id, ch.title, ch.description,
                 ch.time_limit_min, ch.is_active, ch.created_at, co.name
        ORDER BY ch.created_at DESC
      `;
    } else if (filterCompany) {
      challenges = await sql`
        SELECT
          ch.id, ch.company_id, ch.title, ch.description,
          ch.time_limit_min, ch.is_active, ch.created_at,
          co.name AS company_name,
          COUNT(s.id)::int AS candidate_count
        FROM challenges ch
        JOIN companies co ON co.id = ch.company_id
        LEFT JOIN sessions s ON s.challenge_id = ch.id
        WHERE ch.company_id = ${filterCompany}
        GROUP BY ch.id, ch.company_id, ch.title, ch.description,
                 ch.time_limit_min, ch.is_active, ch.created_at, co.name
        ORDER BY ch.created_at DESC
      `;
    } else {
      challenges = await sql`
        SELECT
          ch.id, ch.company_id, ch.title, ch.description,
          ch.time_limit_min, ch.is_active, ch.created_at,
          co.name AS company_name,
          COUNT(s.id)::int AS candidate_count
        FROM challenges ch
        JOIN companies co ON co.id = ch.company_id
        LEFT JOIN sessions s ON s.challenge_id = ch.id
        GROUP BY ch.id, ch.company_id, ch.title, ch.description,
                 ch.time_limit_min, ch.is_active, ch.created_at, co.name
        ORDER BY ch.created_at DESC
      `;
    }

    return NextResponse.json({ challenges, adminCompanyId: user.sub });
  } catch (error) {
    console.error('Admin challenges error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
