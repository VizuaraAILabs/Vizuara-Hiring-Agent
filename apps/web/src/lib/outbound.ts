import sql from './db';

export type OutboundMode = 'discovery' | 'enrichment' | 'draft_outreach' | 'reply_classification';

export interface OutboundEvidenceInput {
  sourceType: string;
  sourceUrl: string;
  signalType: string;
  summary: string;
  quotedText?: string | null;
  confidence?: number | null;
}

export interface OutboundProspectInput {
  companyName: string;
  domain?: string | null;
  industry?: string | null;
  region?: string | null;
  employeeCountEstimate?: string | null;
  fitScore?: number | null;
  signals?: string[];
  scoreReasons?: string[];
  evidence?: OutboundEvidenceInput[];
}

export interface DiscoveryResultInput {
  prospects?: OutboundProspectInput[];
  rejected?: { companyName: string; reason: string }[];
}

export interface OutboundContactInput {
  fullName?: string | null;
  roleTitle?: string | null;
  department?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  linkedinUrl?: string | null;
  source?: string | null;
  confidence?: number | null;
}

export interface EnrichmentResultInput {
  company?: {
    domain?: string | null;
    employeeCountEstimate?: string | null;
    industry?: string | null;
    region?: string | null;
  };
  contacts?: OutboundContactInput[];
}

export interface OutboundDraftInput {
  contactId?: string | null;
  channel?: string | null;
  sequenceStep?: number | null;
  subject?: string | null;
  body?: string | null;
  personalizationBasis?: {
    evidenceIds?: string[];
    reasoning?: string[];
  } | null;
}

export interface DraftOutreachResultInput {
  drafts?: OutboundDraftInput[];
}

export interface ReplyClassificationResultInput {
  classification?: string | null;
  suggestedNextAction?: string | null;
  confidence?: number | null;
  summary?: string | null;
  followUpSuggestion?: string | null;
}

const EMAIL_STATUSES = new Set(['unknown', 'guessed', 'verified', 'invalid', 'risky']);
const DRAFT_CHANNELS = new Set(['email', 'linkedin_manual']);
const REPLY_CLASSIFICATIONS = new Set([
  'interested',
  'not_now',
  'wrong_person',
  'unsubscribe',
  'objection',
  'meeting_requested',
  'negative',
  'auto_reply',
  'unknown',
]);
const NEXT_ACTIONS = new Set([
  'book_meeting',
  'send_answer',
  'follow_up_later',
  'ask_for_referral',
  'suppress_contact',
  'suppress_domain',
  'no_action',
  'review_manually',
]);

function cleanEmailStatus(value?: string | null) {
  return value && EMAIL_STATUSES.has(value) ? value : 'unknown';
}

function cleanDraftChannel(value?: string | null) {
  return value && DRAFT_CHANNELS.has(value) ? value : 'email';
}

function cleanReplyClassification(value?: string | null) {
  return value && REPLY_CLASSIFICATIONS.has(value) ? value : 'unknown';
}

function cleanNextAction(value?: string | null) {
  return value && NEXT_ACTIONS.has(value) ? value : 'review_manually';
}

export function defaultDiscoveryConfig() {
  return {
    maxProspects: 10,
    maxRuntimeMinutes: 8,
    regions: ['US', 'India', 'Europe'],
    companySizes: ['20-1000'],
    roleKeywords: ['software engineer', 'AI engineer', 'ML engineer', 'data engineer'],
    signals: ['active_engineering_hiring', 'ai_hiring_change', 'hiring_pipeline_pain'],
    sources: ['claude_native_web_search', 'public_career_pages', 'manual_imports'],
    dailySendCap: 10,
  };
}

export function mockDiscoveryResult(): DiscoveryResultInput {
  return {
    prospects: [
      {
        companyName: 'Northstar Robotics',
        domain: 'northstar-robotics.example',
        industry: 'Robotics software',
        region: 'US',
        employeeCountEstimate: '100-500',
        fitScore: 86,
        signals: ['active_engineering_hiring', 'ai_hiring_change', 'technical_assessment_fit'],
        scoreReasons: [
          'Mock signal: hiring for AI and platform engineering roles.',
          'Mock signal: public hiring note references AI-assisted candidate evaluation.',
        ],
        evidence: [
          {
            sourceType: 'web',
            sourceUrl: 'https://example.com/northstar-robotics-ai-hiring',
            signalType: 'ai_hiring_change',
            summary: 'Mock evidence showing the company is adapting technical interviews for AI-assisted candidates.',
            quotedText: 'We are changing how we evaluate engineering candidates in the age of AI tools.',
            confidence: 82,
          },
          {
            sourceType: 'ats',
            sourceUrl: 'https://example.com/northstar-robotics-careers',
            signalType: 'active_engineering_hiring',
            summary: 'Mock evidence showing multiple open engineering roles.',
            quotedText: 'Senior Platform Engineer, ML Infrastructure Engineer, Robotics Software Engineer',
            confidence: 88,
          },
        ],
      },
      {
        companyName: 'SignalForge Data',
        domain: 'signalforge-data.example',
        industry: 'Data infrastructure',
        region: 'Europe',
        employeeCountEstimate: '50-200',
        fitScore: 78,
        signals: ['hiring_pipeline_pain', 'technical_assessment_fit'],
        scoreReasons: [
          'Mock signal: technical hiring pain around noisy applicant funnels.',
          'Mock signal: backend and data engineering roles fit ArcEval assessments.',
        ],
        evidence: [
          {
            sourceType: 'news',
            sourceUrl: 'https://example.com/signalforge-hiring-pipeline',
            signalType: 'hiring_pipeline_pain',
            summary: 'Mock evidence that recruiting volume is making technical screening harder.',
            quotedText: 'The team is rethinking screening after a surge in AI-generated applications.',
            confidence: 76,
          },
        ],
      },
    ],
    rejected: [
      {
        companyName: 'Generic Staffing Co',
        reason: 'Mock rejection: hiring activity found but no technical assessment fit.',
      },
    ],
  };
}

export function mockEnrichmentResult(companyName: string, domain?: string | null): EnrichmentResultInput {
  const safeDomain = domain || `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example`;
  return {
    company: {
      domain: safeDomain,
      employeeCountEstimate: '100-500',
      industry: 'Technical hiring',
      region: 'US',
    },
    contacts: [
      {
        fullName: 'Alex Morgan',
        roleTitle: 'Head of Talent',
        department: 'Talent',
        email: `alex@${safeDomain}`,
        emailStatus: 'guessed',
        source: 'Mock public company research',
        confidence: 62,
      },
      {
        fullName: 'Priya Shah',
        roleTitle: 'VP Engineering',
        department: 'Engineering',
        emailStatus: 'unknown',
        source: 'Mock leadership page',
        confidence: 70,
      },
    ],
  };
}

export function mockDraftOutreachResult(
  companyName: string,
  contacts: Array<{ id: string; full_name: string | null }> = [],
  evidence: Array<{ id: string }> = []
): DraftOutreachResultInput {
  const contact = contacts[0];
  const firstName = contact?.full_name?.trim().split(/\s+/)[0] || 'there';
  const evidenceIds = evidence.map((item) => item.id).slice(0, 2);
  return {
    drafts: [
      {
        contactId: contact?.id ?? null,
        channel: 'email',
        sequenceStep: 1,
        subject: 'AI-native technical hiring',
        body: `Hi ${firstName},\n\nI noticed ${companyName} is hiring for technical roles and has signals around adapting hiring for AI-assisted candidates.\n\nArcEval helps teams evaluate candidates in a real AI-assisted coding environment, so reviewers can see how they reason, prompt, debug, and ship.\n\nWorth a quick look next week?`,
        personalizationBasis: {
          evidenceIds,
          reasoning: ['References stored hiring and AI-assessment signals supplied by ArcEval.'],
        },
      },
      {
        contactId: contact?.id ?? null,
        channel: 'linkedin_manual',
        sequenceStep: 1,
        subject: null,
        body: `Noticed ${companyName} is hiring technical roles. I am working on ArcEval, which helps teams evaluate real AI-assisted engineering work. Thought it might be relevant.`,
        personalizationBasis: {
          evidenceIds,
          reasoning: ['Manual LinkedIn note references only company-level hiring context.'],
        },
      },
    ],
  };
}

export function mockReplyClassificationResult(replyText: string): ReplyClassificationResultInput {
  const normalized = replyText.toLowerCase();
  if (normalized.includes('unsubscribe') || normalized.includes('remove me')) {
    return {
      classification: 'unsubscribe',
      suggestedNextAction: 'suppress_contact',
      confidence: 90,
      summary: 'The reply asks to stop future outreach.',
      followUpSuggestion: null,
    };
  }
  if (normalized.includes('meeting') || normalized.includes('calendar') || normalized.includes('interested')) {
    return {
      classification: 'meeting_requested',
      suggestedNextAction: 'book_meeting',
      confidence: 82,
      summary: 'The reply shows interest and asks for a next conversation.',
      followUpSuggestion: 'Send a short scheduling reply with two suggested time windows.',
    };
  }
  return {
    classification: 'unknown',
    suggestedNextAction: 'review_manually',
    confidence: 55,
    summary: 'No clear buying intent was detected.',
    followUpSuggestion: 'Review the reply manually before responding.',
  };
}

export function cleanReplyClassificationResult(result: ReplyClassificationResultInput) {
  const confidence = Number(result.confidence ?? 50);
  return {
    classification: cleanReplyClassification(result.classification),
    suggestedNextAction: cleanNextAction(result.suggestedNextAction),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 50,
    summary: result.summary?.trim() || 'Reply classification needs manual review.',
    followUpSuggestion: result.followUpSuggestion?.trim() || null,
  };
}

export async function storeDiscoveryResult(runId: string, result: DiscoveryResultInput) {
  const prospects = Array.isArray(result.prospects) ? result.prospects : [];

  await sql.begin(async (tx) => {
    const trx = tx as unknown as typeof sql;
    let evidenceCount = 0;

    for (const prospect of prospects) {
      const companyName = String(prospect.companyName || '').trim();
      if (!companyName) continue;
      const usableEvidence = (prospect.evidence ?? []).filter((evidence) => (
        evidence.sourceUrl && evidence.summary && evidence.signalType
      ));
      if (usableEvidence.length === 0) continue;
      const domain = prospect.domain ? String(prospect.domain).trim().toLowerCase() : null;

      const existing = domain
        ? await trx<{ id: string }[]>`
            SELECT id FROM outbound_prospects
            WHERE LOWER(domain) = ${domain}
            LIMIT 1
          `
        : await trx<{ id: string }[]>`
            SELECT id FROM outbound_prospects
            WHERE domain IS NULL AND LOWER(company_name) = ${companyName.toLowerCase()}
            LIMIT 1
          `;

      let prospectId = existing[0]?.id;
      const metadata = {
        industry: prospect.industry ?? null,
        region: prospect.region ?? null,
        employeeCountEstimate: prospect.employeeCountEstimate ?? null,
      };

      if (prospectId) {
        await trx`
          UPDATE outbound_prospects
          SET
            company_name = ${companyName},
            domain = ${domain},
            fit_score = ${prospect.fitScore ?? null},
            score_reasons = ${JSON.stringify(prospect.scoreReasons ?? [])}::jsonb,
            signals = ${trx.array(prospect.signals ?? [], 25)},
            source_run_id = ${runId},
            metadata = ${JSON.stringify(metadata)}::jsonb,
            updated_at = NOW()
          WHERE id = ${prospectId}
        `;
      } else {
        const [created] = await trx<{ id: string }[]>`
          INSERT INTO outbound_prospects (
            company_name, domain, fit_score, score_reasons, signals, source_run_id, metadata
          )
          VALUES (
            ${companyName},
            ${domain},
            ${prospect.fitScore ?? null},
            ${JSON.stringify(prospect.scoreReasons ?? [])}::jsonb,
            ${trx.array(prospect.signals ?? [], 25)},
            ${runId},
            ${JSON.stringify(metadata)}::jsonb
          )
          RETURNING id
        `;
        prospectId = created.id;
      }

      for (const evidence of usableEvidence) {
        await trx`
          INSERT INTO outbound_evidence (
            prospect_id, run_id, source_type, source_url, signal_type, summary, quoted_text, confidence
          )
          VALUES (
            ${prospectId},
            ${runId},
            ${evidence.sourceType || 'web'},
            ${evidence.sourceUrl},
            ${evidence.signalType},
            ${evidence.summary},
            ${evidence.quotedText ?? null},
            ${evidence.confidence ?? null}
          )
        `;
        evidenceCount += 1;
      }
    }

    await trx`
      UPDATE outbound_agent_runs
      SET
        status = 'completed',
        completed_at = NOW(),
        last_heartbeat_at = NOW(),
        stats = ${JSON.stringify({
          prospectsFound: prospects.length,
          evidenceFound: evidenceCount,
          rejected: Array.isArray(result.rejected) ? result.rejected.length : 0,
        })}::jsonb
      WHERE id = ${runId}
    `;
  });
}

export async function storeEnrichmentResult(runId: string, prospectId: string, result: EnrichmentResultInput) {
  const contacts = Array.isArray(result.contacts) ? result.contacts : [];
  const company = result.company ?? {};
  const metadata = Object.fromEntries(
    Object.entries({
      industry: company.industry,
      region: company.region,
      employeeCountEstimate: company.employeeCountEstimate,
    }).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );

  await sql.begin(async (tx) => {
    const trx = tx as unknown as typeof sql;

    await trx`
      UPDATE outbound_prospects
      SET
        domain = COALESCE(${company.domain ?? null}, domain),
        metadata = metadata || ${JSON.stringify(metadata)}::jsonb,
        status = 'enriched',
        source_run_id = ${runId},
        updated_at = NOW()
      WHERE id = ${prospectId}
    `;

    await trx`
      DELETE FROM outbound_contacts
      WHERE prospect_id = ${prospectId}
    `;

    let storedContacts = 0;
    for (const contact of contacts) {
      const fullName = contact.fullName?.trim() || null;
      const roleTitle = contact.roleTitle?.trim() || null;
      const email = contact.email?.trim().toLowerCase() || null;
      const linkedinUrl = contact.linkedinUrl?.trim() || null;
      if (!fullName && !roleTitle && !email && !linkedinUrl) continue;

      await trx`
        INSERT INTO outbound_contacts (
          prospect_id, full_name, role_title, email, email_status, linkedin_url, source, confidence, metadata
        )
        VALUES (
          ${prospectId},
          ${fullName},
          ${roleTitle},
          ${email},
          ${cleanEmailStatus(contact.emailStatus)},
          ${linkedinUrl},
          ${contact.source ?? null},
          ${contact.confidence ?? null},
          ${JSON.stringify({ department: contact.department ?? null })}::jsonb
        )
      `;
      storedContacts += 1;
    }

    await trx`
      UPDATE outbound_agent_runs
      SET
        status = 'completed',
        completed_at = NOW(),
        last_heartbeat_at = NOW(),
        stats = ${JSON.stringify({ contactsFound: storedContacts })}::jsonb
      WHERE id = ${runId}
    `;
  });
}

export async function storeDraftOutreachResult(
  runId: string,
  prospectId: string,
  result: DraftOutreachResultInput,
  allowedContactIds: string[] = []
) {
  const drafts = Array.isArray(result.drafts) ? result.drafts : [];
  const allowedContacts = new Set(allowedContactIds);

  await sql.begin(async (tx) => {
    const trx = tx as unknown as typeof sql;

    await trx`
      DELETE FROM outbound_drafts
      WHERE prospect_id = ${prospectId}
        AND status IN ('draft', 'edited', 'rejected')
    `;

    let storedDrafts = 0;
    for (const draft of drafts) {
      const body = draft.body?.trim();
      if (!body) continue;

      const channel = cleanDraftChannel(draft.channel);
      const subject = channel === 'email' ? draft.subject?.trim() || 'Quick question' : draft.subject?.trim() || null;
      const sequenceStep = Number.isFinite(Number(draft.sequenceStep))
        ? Math.max(1, Math.min(5, Math.round(Number(draft.sequenceStep))))
        : 1;
      const contactId = draft.contactId && allowedContacts.has(draft.contactId) ? draft.contactId : null;

      await trx`
        INSERT INTO outbound_drafts (
          prospect_id, contact_id, run_id, channel, sequence_step, subject, body, personalization_basis, status
        )
        VALUES (
          ${prospectId},
          ${contactId},
          ${runId},
          ${channel},
          ${sequenceStep},
          ${subject},
          ${body},
          ${JSON.stringify(draft.personalizationBasis ?? {})}::jsonb,
          'draft'
        )
      `;
      storedDrafts += 1;
    }

    if (storedDrafts === 0) {
      throw new Error('No usable outreach drafts returned');
    }

    await trx`
      UPDATE outbound_prospects
      SET status = 'drafted', source_run_id = ${runId}, updated_at = NOW()
      WHERE id = ${prospectId}
    `;

    await trx`
      UPDATE outbound_agent_runs
      SET
        status = 'completed',
        completed_at = NOW(),
        last_heartbeat_at = NOW(),
        stats = ${JSON.stringify({ draftsFound: storedDrafts })}::jsonb
      WHERE id = ${runId}
    `;
  });
}
