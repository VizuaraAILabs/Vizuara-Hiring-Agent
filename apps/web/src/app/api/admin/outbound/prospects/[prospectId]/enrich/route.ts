import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import {
  mockEnrichmentResult,
  storeEnrichmentResult,
  type EnrichmentResultInput,
} from '@/lib/outbound';

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email, user.role)) return null;
  return user;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { prospectId } = await params;
  const [prospect] = await sql<{
    id: string;
    company_name: string;
    domain: string | null;
    status: string;
    metadata: Record<string, unknown>;
  }[]>`
    SELECT id, company_name, domain, status, metadata
    FROM outbound_prospects
    WHERE id = ${prospectId}
    LIMIT 1
  `;

  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!['approved', 'enriched'].includes(prospect.status)) {
    return NextResponse.json({ error: 'Approve the prospect before enrichment' }, { status: 400 });
  }
  const previousStatus = prospect.status;

  const evidence = await sql`
    SELECT source_type, source_url, signal_type, summary, quoted_text, confidence
    FROM outbound_evidence
    WHERE prospect_id = ${prospectId}
    ORDER BY created_at DESC
    LIMIT 8
  `;

  const config = {
    prospectId,
    companyName: prospect.company_name,
    domain: prospect.domain,
    metadata: prospect.metadata ?? {},
    evidence,
    desiredContactRoles: [
      'Founder',
      'CTO',
      'VP Engineering',
      'Head of Engineering',
      'Head of Talent',
      'Talent Acquisition Lead',
      'Recruiting Operations',
    ],
    maxContacts: 8,
    maxRuntimeMinutes: 8,
  };

  const [run] = await sql<{ id: string }[]>`
    INSERT INTO outbound_agent_runs (mode, status, config, started_by_email, started_at, last_heartbeat_at)
    VALUES ('enrichment', 'running', ${JSON.stringify(config)}::jsonb, ${user.email}, NOW(), NOW())
    RETURNING id
  `;

  await sql`
    UPDATE outbound_prospects
    SET status = 'enrichment_requested', updated_at = NOW()
    WHERE id = ${prospectId}
  `;

  const agentUrl = process.env.OUTBOUND_AGENT_URL;
  try {
    let result: EnrichmentResultInput;
    if (agentUrl) {
      const response = await fetch(`${agentUrl.replace(/\/$/, '')}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ARCEVAL_AGENT_SECRET ? { Authorization: `Bearer ${process.env.ARCEVAL_AGENT_SECRET}` } : {}),
        },
        body: JSON.stringify({ runId: run.id, mode: 'enrichment', config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Outbound agent returned ${response.status}`);
      result = (data.result || {}) as EnrichmentResultInput;
    } else {
      result = mockEnrichmentResult(prospect.company_name, prospect.domain);
    }

    await storeEnrichmentResult(run.id, prospectId, result);
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outbound enrichment failed';
    await sql`
      UPDATE outbound_agent_runs
      SET status = 'failed', completed_at = NOW(), error = ${message}
      WHERE id = ${run.id}
    `;
    await sql`
      UPDATE outbound_prospects
      SET status = ${previousStatus}, updated_at = NOW()
      WHERE id = ${prospectId}
    `;
    return NextResponse.json({ error: message, runId: run.id }, { status: 500 });
  }
}
