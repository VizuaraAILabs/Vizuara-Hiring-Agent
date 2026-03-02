import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { Challenge, Session, StarterFile } from '@/types';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${id}`;

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sessions = await sql<Session[]>`
      SELECT * FROM sessions WHERE challenge_id = ${id} ORDER BY created_at DESC
    `;

    // Ensure starter_files is always a parsed array (postgres may return it as a string)
    const starterFiles = typeof challenge.starter_files === 'string'
      ? JSON.parse(challenge.starter_files)
      : challenge.starter_files;

    return NextResponse.json({ ...challenge, starter_files: starterFiles, sessions });
  } catch (error) {
    console.error('Error fetching challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${id}`;

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { starter_files } = await request.json();

    // Validate starter_files
    if (!Array.isArray(starter_files)) {
      return NextResponse.json({ error: 'starter_files must be an array' }, { status: 400 });
    }

    for (const file of starter_files as StarterFile[]) {
      if (!file.path || typeof file.path !== 'string') {
        return NextResponse.json({ error: 'Each file must have a valid path' }, { status: 400 });
      }
      if (file.path.includes('..') || file.path.startsWith('/')) {
        return NextResponse.json({ error: 'Invalid file path: ' + file.path }, { status: 400 });
      }
      if (typeof file.content !== 'string') {
        return NextResponse.json({ error: 'Each file must have string content' }, { status: 400 });
      }
    }

    const starterFilesJson = starter_files.length > 0 ? JSON.stringify(starter_files) : null;

    const [updated] = await sql<Challenge[]>`
      UPDATE challenges
      SET starter_files = ${starterFilesJson}
      WHERE id = ${id}
      RETURNING *
    `;

    // Ensure starter_files is a parsed array
    const parsedFiles = typeof updated.starter_files === 'string'
      ? JSON.parse(updated.starter_files)
      : updated.starter_files;

    return NextResponse.json({ ...updated, starter_files: parsedFiles });
  } catch (error) {
    console.error('Error updating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
