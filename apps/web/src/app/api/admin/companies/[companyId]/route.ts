import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { companyId } = await params;
    if (user.companyId && companyId === user.companyId) {
      return NextResponse.json({ error: 'You cannot delete your own company.' }, { status: 400 });
    }

    const [company] = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM companies WHERE id = ${companyId}
      LIMIT 1
    `;

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    await sql.begin(async (tx) => {
      const trx = tx as unknown as typeof sql;

      await trx`
        UPDATE usage_events ue
        SET
          company_deleted = TRUE,
          metadata = COALESCE(ue.metadata, '{}'::jsonb) || jsonb_build_object(
            'deleted_company_id', ${companyId},
            'deleted_company_name', ${company.name},
            'deleted_session_id', ue.session_id
          ),
          company_id = NULL,
          session_id = NULL
        WHERE ue.company_id = ${companyId}
          OR ue.session_id IN (
            SELECT s.id
            FROM sessions s
            JOIN challenges ch ON ch.id = s.challenge_id
            WHERE ch.company_id = ${companyId}
          )
      `;

      await trx`DELETE FROM cost_settings WHERE company_id = ${companyId}`;

      await trx`
        DELETE FROM interaction_annotations
        WHERE analysis_id IN (
          SELECT ar.id
          FROM analysis_results ar
          JOIN sessions s ON s.id = ar.session_id
          JOIN challenges ch ON ch.id = s.challenge_id
          WHERE ch.company_id = ${companyId}
        )
        OR interaction_id IN (
          SELECT i.id
          FROM interactions i
          JOIN sessions s ON s.id = i.session_id
          JOIN challenges ch ON ch.id = s.challenge_id
          WHERE ch.company_id = ${companyId}
        )
      `;

      await trx`
        DELETE FROM analysis_results
        WHERE session_id IN (
          SELECT s.id
          FROM sessions s
          JOIN challenges ch ON ch.id = s.challenge_id
          WHERE ch.company_id = ${companyId}
        )
      `;

      await trx`
        DELETE FROM interactions
        WHERE session_id IN (
          SELECT s.id
          FROM sessions s
          JOIN challenges ch ON ch.id = s.challenge_id
          WHERE ch.company_id = ${companyId}
        )
      `;

      await trx`
        DELETE FROM sessions
        WHERE challenge_id IN (
          SELECT id FROM challenges WHERE company_id = ${companyId}
        )
      `;

      await trx`DELETE FROM challenges WHERE company_id = ${companyId}`;
      await trx`DELETE FROM companies WHERE id = ${companyId}`;
    });

    return NextResponse.json({ ok: true, deletedCompany: company });
  } catch (error) {
    console.error('Delete company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
