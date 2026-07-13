import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { sendOutboundEmail } from '@/lib/brevo';

const DAILY_EMAIL_CAP = 10;

function emailDomain(email: string | null) {
  return email?.split('@')[1]?.trim().toLowerCase() || null;
}

async function blockedReason(values: {
  companyName: string;
  domain: string | null;
  email: string | null;
}) {
  const email = values.email?.toLowerCase() ?? null;
  const domain = values.domain?.toLowerCase() || emailDomain(email);
  const companyName = values.companyName.toLowerCase();

  const [suppressed] = await sql<{ type: string; value: string }[]>`
    SELECT type, value
    FROM outbound_suppression
    WHERE
      (type = 'email' AND ${email} IS NOT NULL AND LOWER(value) = ${email})
      OR (type = 'domain' AND ${domain} IS NOT NULL AND LOWER(value) = ${domain})
      OR (type = 'company_name' AND LOWER(value) = ${companyName})
    LIMIT 1
  `;
  if (suppressed) return `Suppressed ${suppressed.type}: ${suppressed.value}`;

  const [customer] = await sql<{ id: string }[]>`
    SELECT id
    FROM companies
    WHERE
      (${email} IS NOT NULL AND LOWER(email) = ${email})
      OR (${domain} IS NOT NULL AND LOWER(split_part(email, '@', 2)) = ${domain})
    LIMIT 1
  `;
  if (customer) return 'Existing ArcEval customer';

  return null;
}

async function recordFailure(draftId: string, message: string) {
  await sql`
    INSERT INTO outbound_messages (draft_id, prospect_id, contact_id, channel, provider, status, metadata)
    SELECT id, prospect_id, contact_id, channel, 'brevo', 'failed', ${JSON.stringify({ error: message })}::jsonb
    FROM outbound_drafts
    WHERE id = ${draftId}
  `;
}

async function recordSent(values: {
  draftId: string;
  prospectId: string;
  contactId: string | null;
  channel: 'email' | 'linkedin_manual';
  provider: 'brevo' | 'manual';
  status: 'sent' | 'manual_sent';
  sentByEmail: string;
  providerMessageId?: string | null;
}) {
  await sql.begin(async (tx) => {
    const trx = tx as unknown as typeof sql;
    await trx`
      INSERT INTO outbound_messages (
        draft_id, prospect_id, contact_id, channel, provider, provider_message_id, status, sent_by_email, sent_at, metadata
      )
      VALUES (
        ${values.draftId}, ${values.prospectId}, ${values.contactId}, ${values.channel}, ${values.provider},
        ${values.providerMessageId ?? null}, ${values.status}, ${values.sentByEmail}, NOW(), '{}'::jsonb
      )
    `;
    await trx`
      UPDATE outbound_drafts
      SET status = 'sent', updated_at = NOW()
      WHERE id = ${values.draftId}
    `;
    await trx`
      UPDATE outbound_prospects
      SET status = 'contacted', updated_at = NOW()
      WHERE id = ${values.prospectId}
    `;
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email, user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { draftId } = await params;
  const [draft] = await sql<{
    id: string;
    prospect_id: string;
    contact_id: string | null;
    channel: 'email' | 'linkedin_manual';
    subject: string | null;
    body: string;
    status: string;
    company_name: string;
    domain: string | null;
    contact_name: string | null;
    contact_email: string | null;
  }[]>`
    SELECT
      d.id,
      d.prospect_id,
      d.contact_id,
      d.channel,
      d.subject,
      d.body,
      d.status,
      p.company_name,
      p.domain,
      c.full_name AS contact_name,
      c.email AS contact_email
    FROM outbound_drafts d
    JOIN outbound_prospects p ON p.id = d.prospect_id
    LEFT JOIN outbound_contacts c ON c.id = d.contact_id
    WHERE d.id = ${draftId}
    LIMIT 1
  `;

  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (draft.status !== 'approved') {
    return NextResponse.json({ error: 'Approve the draft before sending' }, { status: 400 });
  }

  const [existingMessage] = await sql<{ id: string }[]>`
    SELECT id
    FROM outbound_messages
    WHERE draft_id = ${draftId}
      AND status IN ('sent', 'manual_sent')
    LIMIT 1
  `;
  if (existingMessage) return NextResponse.json({ error: 'Draft has already been sent' }, { status: 400 });

  const blocked = await blockedReason({
    companyName: draft.company_name,
    domain: draft.domain,
    email: draft.contact_email,
  });
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  if (draft.channel === 'linkedin_manual') {
    await recordSent({
      draftId: draft.id,
      prospectId: draft.prospect_id,
      contactId: draft.contact_id,
      channel: 'linkedin_manual',
      provider: 'manual',
      status: 'manual_sent',
      sentByEmail: user.email,
    });
    return NextResponse.json({ ok: true, status: 'manual_sent' });
  }

  if (!draft.contact_email) {
    return NextResponse.json({ error: 'Email draft requires a contact email' }, { status: 400 });
  }
  if (!draft.subject?.trim()) {
    return NextResponse.json({ error: 'Email draft requires a subject' }, { status: 400 });
  }

  const [sentToday] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM outbound_messages
    WHERE channel = 'email'
      AND status = 'sent'
      AND sent_at >= date_trunc('day', NOW())
  `;
  if ((sentToday?.count ?? 0) >= DAILY_EMAIL_CAP) {
    return NextResponse.json({ error: `Daily outbound email cap reached (${DAILY_EMAIL_CAP})` }, { status: 400 });
  }

  try {
    const result = await sendOutboundEmail({
      to: draft.contact_email,
      toName: draft.contact_name || draft.company_name,
      subject: draft.subject,
      bodyText: draft.body,
    });

    await recordSent({
      draftId: draft.id,
      prospectId: draft.prospect_id,
      contactId: draft.contact_id,
      channel: 'email',
      provider: 'brevo',
      providerMessageId: result.messageId,
      status: 'sent',
      sentByEmail: user.email,
    });

    return NextResponse.json({ ok: true, status: 'sent' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send outbound email';
    await recordFailure(draft.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
