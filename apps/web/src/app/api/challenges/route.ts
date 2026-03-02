import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import type { Challenge } from '@/types';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const challenges = await sql`
      SELECT c.*, COUNT(s.id)::int as candidate_count
      FROM challenges c
      LEFT JOIN sessions s ON s.challenge_id = c.id
      WHERE c.company_id = ${user.sub}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;

    return NextResponse.json(challenges);
  } catch (error) {
    console.error('Error listing challenges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, description, time_limit_min, starter_files_dir, starter_files } = await request.json();

    if (!title || !description) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const id = uuidv4();
    const timeLimit = time_limit_min || 60;
    const starterDir = starter_files_dir || null;
    const starterFiles = Array.isArray(starter_files) && starter_files.length > 0
      ? JSON.stringify(starter_files)
      : null;

    await sql`
      INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir, starter_files)
      VALUES (${id}, ${user.sub}, ${title}, ${description}, ${timeLimit}, ${starterDir}, ${starterFiles})
    `;

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${id}`;

    // Ensure starter_files is a parsed array
    const parsedFiles = typeof challenge.starter_files === 'string'
      ? JSON.parse(challenge.starter_files)
      : challenge.starter_files;

    return NextResponse.json({ ...challenge, starter_files: parsedFiles }, { status: 201 });
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
