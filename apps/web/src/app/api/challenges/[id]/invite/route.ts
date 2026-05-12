import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { generateToken } from '@/lib/utils';
import { addEmailToAllowlist, validateChallengeAccess } from '@/lib/challenge-access';
import { getChallengeById } from '@/lib/challenge-queries';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { id } = await params;

    const challenge = await getChallengeById(id);

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { candidate_name, candidate_email } = await request.json();

    if (!candidate_name || !candidate_email) {
      return NextResponse.json({ error: 'Candidate name and email are required' }, { status: 400 });
    }

    const timingAccess = await validateChallengeAccess(challenge, { allowBeforeStart: true });
    if (!timingAccess.ok) {
      return NextResponse.json(
        { error: timingAccess.message, reason: timingAccess.reason },
        { status: timingAccess.status }
      );
    }

    const [existing] = await sql`
      SELECT token, status FROM sessions
      WHERE challenge_id = ${id} AND candidate_email = ${candidate_email}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (existing) {
      if (existing.status === 'pending' || existing.status === 'active') {
        const allowedEmails = addEmailToAllowlist(challenge.allowed_emails, candidate_email);
        await sql`UPDATE challenges SET allowed_emails = ${allowedEmails} WHERE id = ${id}`;
        return NextResponse.json({ token: existing.token, invite_url: `/session/${existing.token}` });
      }
      return NextResponse.json(
        { error: 'This candidate already has a submitted assessment for this challenge.' },
        { status: 403 }
      );
    }

    const access = await validateChallengeAccess(challenge, {
      allowBeforeStart: true,
      enforceCapacity: true,
      enforcePlanQuota: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, reason: access.reason }, { status: access.status });
    }

    const sessionId = uuidv4();
    const token = generateToken();
    const allowedEmails = addEmailToAllowlist(challenge.allowed_emails, candidate_email);

    await sql.begin(async (tx) => {
      const trx = tx as unknown as typeof sql;

      await trx`
        INSERT INTO sessions (id, challenge_id, candidate_name, candidate_email, token)
        VALUES (${sessionId}, ${id}, ${candidate_name}, ${candidate_email}, ${token})
      `;
      await trx`UPDATE challenges SET allowed_emails = ${allowedEmails} WHERE id = ${id}`;
    });

    return NextResponse.json({ token, invite_url: `/session/${token}` }, { status: 201 });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
