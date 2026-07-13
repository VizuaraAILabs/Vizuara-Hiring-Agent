import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import {
  defaultDiscoveryConfig,
  mockDiscoveryResult,
  storeDiscoveryResult,
  type DiscoveryResultInput,
} from '@/lib/outbound';

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email, user.role)) return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [runs, prospects] = await Promise.all([
    sql`
      SELECT id, mode, status, config, started_by_email, started_at, last_heartbeat_at,
             completed_at, error, stats, created_at
      FROM outbound_agent_runs
      ORDER BY created_at DESC
      LIMIT 25
    `,
    sql`
      SELECT
        p.id,
        p.company_name,
        p.domain,
        p.status,
        p.fit_score,
        p.score_reasons,
        p.signals,
        p.metadata,
        p.created_at,
        p.updated_at,
        COUNT(e.id)::int AS evidence_count
      FROM outbound_prospects p
      LEFT JOIN outbound_evidence e ON e.prospect_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 50
    `,
  ]);

  return NextResponse.json({ runs, prospects });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const config = { ...defaultDiscoveryConfig(), ...(body?.config || {}) };

  const [run] = await sql<{ id: string }[]>`
    INSERT INTO outbound_agent_runs (mode, status, config, started_by_email, started_at, last_heartbeat_at)
    VALUES ('discovery', 'running', ${JSON.stringify(config)}::jsonb, ${user.email}, NOW(), NOW())
    RETURNING id
  `;

  const agentUrl = process.env.OUTBOUND_AGENT_URL;
  try {
    if (agentUrl) {
      const response = await fetch(`${agentUrl.replace(/\/$/, '')}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ARCEVAL_AGENT_SECRET ? { Authorization: `Bearer ${process.env.ARCEVAL_AGENT_SECRET}` } : {}),
        },
        body: JSON.stringify({ runId: run.id, mode: 'discovery', config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Outbound agent returned ${response.status}`);
      const result = data.result as DiscoveryResultInput | undefined;
      if (result) await storeDiscoveryResult(run.id, result);
    } else {
      await storeDiscoveryResult(run.id, mockDiscoveryResult());
    }
  } catch (error) {
    await sql`
      UPDATE outbound_agent_runs
      SET status = 'failed', completed_at = NOW(), error = ${error instanceof Error ? error.message : 'Outbound run failed'}
      WHERE id = ${run.id}
    `;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Outbound run failed', runId: run.id }, { status: 500 });
  }

  return NextResponse.json({ ok: true, runId: run.id });
}
