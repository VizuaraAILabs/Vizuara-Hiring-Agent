import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, hasCompanyRole } from '@/lib/auth';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Challenge } from '@/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }
    if (!hasCompanyRole(user, ['owner', 'recruiter'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const challenge = await getChallengeById(id);

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (challenge.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.archived !== 'boolean') {
      return NextResponse.json({ error: 'archived must be a boolean' }, { status: 400 });
    }
    if (body.close != null && typeof body.close !== 'boolean') {
      return NextResponse.json({ error: 'close must be a boolean' }, { status: 400 });
    }

    const archived = body.archived;
    const close = body.close === true;

    const [updated] = await sql<Challenge[]>`
      UPDATE challenges
      SET
        archived_at = CASE WHEN ${archived} THEN NOW() ELSE NULL END,
        is_active = CASE WHEN ${archived && close} THEN FALSE ELSE is_active END
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating challenge archive state:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
