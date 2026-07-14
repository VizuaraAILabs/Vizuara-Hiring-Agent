import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import {
  mockDraftOutreachResult,
  storeDraftOutreachResult,
  type DraftOutreachResultInput,
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
  if (!['enriched', 'drafted'].includes(prospect.status)) {
    return NextResponse.json({ error: 'Enrich the prospect before drafting' }, { status: 400 });
  }
  const previousStatus = prospect.status;

  const [contacts, evidence] = await Promise.all([
    sql<{
      id: string;
      full_name: string | null;
      role_title: string | null;
      email: string | null;
      email_status: string;
      linkedin_url: string | null;
    }[]>`
      SELECT id, full_name, role_title, email, email_status, linkedin_url
      FROM outbound_contacts
      WHERE prospect_id = ${prospectId}
      ORDER BY confidence DESC NULLS LAST, created_at DESC
      LIMIT 8
    `,
    sql<{
      id: string;
      source_type: string;
      source_url: string;
      signal_type: string;
      summary: string;
      quoted_text: string | null;
      confidence: number | null;
    }[]>`
      SELECT id, source_type, source_url, signal_type, summary, quoted_text, confidence
      FROM outbound_evidence
      WHERE prospect_id = ${prospectId}
      ORDER BY created_at DESC
      LIMIT 8
    `,
  ]);
  if (evidence.length === 0) {
    return NextResponse.json({ error: 'Drafting requires stored evidence' }, { status: 400 });
  }

  const config = {
    prospectId,
    companyName: prospect.company_name,
    domain: prospect.domain,
    metadata: prospect.metadata ?? {},
    contacts: contacts.map((contact) => ({
      id: contact.id,
      fullName: contact.full_name,
      roleTitle: contact.role_title,
      email: contact.email,
      emailStatus: contact.email_status,
      linkedinUrl: contact.linkedin_url,
    })),
    evidence,
    maxDrafts: 8,
    maxRuntimeMinutes: 8,
  };

  const [run] = await sql<{ id: string }[]>`
    INSERT INTO outbound_agent_runs (mode, status, config, started_by_email, started_at, last_heartbeat_at)
    VALUES ('draft_outreach', 'running', ${JSON.stringify(config)}::jsonb, ${user.email}, NOW(), NOW())
    RETURNING id
  `;

  await sql`
    UPDATE outbound_prospects
    SET status = 'draft_requested', updated_at = NOW()
    WHERE id = ${prospectId}
  `;

  const agentUrl = process.env.OUTBOUND_AGENT_URL;
  try {
    let result: DraftOutreachResultInput;
    if (agentUrl) {
      const response = await fetch(`${agentUrl.replace(/\/$/, '')}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ARCEVAL_AGENT_SECRET ? { Authorization: `Bearer ${process.env.ARCEVAL_AGENT_SECRET}` } : {}),
        },
        body: JSON.stringify({ runId: run.id, mode: 'draft_outreach', config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Outbound agent returned ${response.status}`);
      result = (data.result || {}) as DraftOutreachResultInput;
    } else {
      result = mockDraftOutreachResult(prospect.company_name, contacts, evidence);
    }

    await storeDraftOutreachResult(run.id, prospectId, result, contacts.map((contact) => contact.id));
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outbound draft generation failed';
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
