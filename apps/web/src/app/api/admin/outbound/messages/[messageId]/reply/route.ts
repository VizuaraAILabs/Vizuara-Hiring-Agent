import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import {
  cleanReplyClassificationResult,
  mockReplyClassificationResult,
  type ReplyClassificationResultInput,
} from '@/lib/outbound';

function emailDomain(email: string | null) {
  return email?.split('@')[1]?.trim().toLowerCase() || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email, user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { messageId } = await params;
  const body = await req.json().catch(() => ({}));
  const replyText = typeof body?.replyText === 'string' ? body.replyText.trim() : '';
  if (!replyText) return NextResponse.json({ error: 'replyText is required' }, { status: 400 });

  const [message] = await sql<{
    id: string;
    draft_id: string | null;
    prospect_id: string;
    contact_id: string | null;
    channel: string;
    company_name: string;
    domain: string | null;
    metadata: Record<string, unknown>;
    contact_name: string | null;
    contact_email: string | null;
    role_title: string | null;
  }[]>`
    SELECT
      m.id,
      m.draft_id,
      m.prospect_id,
      m.contact_id,
      m.channel,
      m.metadata,
      p.company_name,
      p.domain,
      c.full_name AS contact_name,
      c.email AS contact_email,
      c.role_title
    FROM outbound_messages m
    JOIN outbound_prospects p ON p.id = m.prospect_id
    LEFT JOIN outbound_contacts c ON c.id = m.contact_id
    WHERE m.id = ${messageId}
      AND m.status IN ('sent', 'manual_sent')
    LIMIT 1
  `;

  if (!message) return NextResponse.json({ error: 'Sent outbound message not found' }, { status: 404 });

  const config = {
    messageId,
    replyText,
    channel: message.channel,
    companyName: message.company_name,
    domain: message.domain,
    contact: {
      name: message.contact_name,
      email: message.contact_email,
      roleTitle: message.role_title,
    },
    previousMessageMetadata: message.metadata ?? {},
    maxRuntimeMinutes: 4,
  };

  const [run] = await sql<{ id: string }[]>`
    INSERT INTO outbound_agent_runs (mode, status, config, started_by_email, started_at, last_heartbeat_at)
    VALUES ('reply_classification', 'running', ${JSON.stringify(config)}::jsonb, ${user.email}, NOW(), NOW())
    RETURNING id
  `;

  const agentUrl = process.env.OUTBOUND_AGENT_URL;
  try {
    let rawResult: ReplyClassificationResultInput;
    if (agentUrl) {
      const response = await fetch(`${agentUrl.replace(/\/$/, '')}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ARCEVAL_AGENT_SECRET ? { Authorization: `Bearer ${process.env.ARCEVAL_AGENT_SECRET}` } : {}),
        },
        body: JSON.stringify({ runId: run.id, mode: 'reply_classification', config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Outbound agent returned ${response.status}`);
      rawResult = (data.result || {}) as ReplyClassificationResultInput;
    } else {
      rawResult = mockReplyClassificationResult(replyText);
    }

    const result = cleanReplyClassificationResult(rawResult);
    const metadata = {
      sourceMessageId: message.id,
      replyText,
      classifiedByRunId: run.id,
      classification: result.classification,
      suggestedNextAction: result.suggestedNextAction,
      confidence: result.confidence,
      summary: result.summary,
      followUpSuggestion: result.followUpSuggestion,
      recordedByEmail: user.email,
    };

    await sql.begin(async (tx) => {
      const trx = tx as unknown as typeof sql;
      await trx`
        INSERT INTO outbound_messages (
          draft_id, prospect_id, contact_id, channel, provider, status, sent_by_email, sent_at, metadata
        )
        VALUES (
          ${message.draft_id}, ${message.prospect_id}, ${message.contact_id}, ${message.channel},
          'manual', 'reply_received', ${user.email}, NOW(), ${JSON.stringify(metadata)}::jsonb
        )
      `;

      await trx`
        UPDATE outbound_prospects
        SET
          status = 'replied',
          metadata = metadata || ${JSON.stringify({
            lastReplyClassification: result.classification,
            lastReplyNextAction: result.suggestedNextAction,
            lastReplyConfidence: result.confidence,
          })}::jsonb,
          updated_at = NOW()
        WHERE id = ${message.prospect_id}
      `;

      await trx`
        UPDATE outbound_agent_runs
        SET
          status = 'completed',
          completed_at = NOW(),
          last_heartbeat_at = NOW(),
          stats = ${JSON.stringify({ repliesClassified: 1 })}::jsonb
        WHERE id = ${run.id}
      `;

      if (result.classification === 'unsubscribe') {
        const email = message.contact_email?.toLowerCase() ?? null;
        const domain = (message.domain || emailDomain(email))?.toLowerCase() ?? null;
        if (email) {
          await trx`
            INSERT INTO outbound_suppression (type, value, reason, created_by_email)
            VALUES ('email', ${email}, 'unsubscribe reply', ${user.email})
            ON CONFLICT DO NOTHING
          `;
        }
        if (domain && result.suggestedNextAction === 'suppress_domain') {
          await trx`
            INSERT INTO outbound_suppression (type, value, reason, created_by_email)
            VALUES ('domain', ${domain}, 'unsubscribe reply', ${user.email})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    });

    return NextResponse.json({ ok: true, runId: run.id, classification: result });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Reply classification failed';
    await sql`
      UPDATE outbound_agent_runs
      SET status = 'failed', completed_at = NOW(), error = ${messageText}
      WHERE id = ${run.id}
    `;
    return NextResponse.json({ error: messageText, runId: run.id }, { status: 500 });
  }
}
