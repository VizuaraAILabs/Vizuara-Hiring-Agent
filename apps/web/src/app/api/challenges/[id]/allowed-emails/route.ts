import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { Challenge } from '@/types';

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

    const { allowed_emails: raw } = await request.json();

    // Parse comma-separated string → cleaned array; empty string → NULL (open access)
    const parsed: string[] = typeof raw === 'string'
      ? raw.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];

    const value = parsed.length > 0 ? parsed : null;

    await sql`UPDATE challenges SET allowed_emails = ${value} WHERE id = ${id}`;

    return NextResponse.json({ allowed_emails: parsed });
  } catch (error) {
    console.error('Error saving allowed emails:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
