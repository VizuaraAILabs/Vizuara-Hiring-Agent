export type RunMode = 'discovery' | 'enrichment' | 'draft_outreach' | 'reply_classification';

export interface RunRequest {
  runId: string;
  mode: RunMode;
  config?: Record<string, unknown>;
}

export interface DiscoveryProspect {
  companyName: string;
  domain: string | null;
  industry?: string | null;
  region?: string | null;
  employeeCountEstimate?: string | null;
  fitScore: number;
  signals: string[];
  scoreReasons: string[];
  evidence: Array<{
    sourceType: string;
    sourceUrl: string;
    signalType: string;
    summary: string;
    quotedText?: string | null;
    confidence?: number | null;
  }>;
  recommendedNextStep: string;
}

export interface DiscoveryResult {
  prospects: DiscoveryProspect[];
  rejected: Array<{ companyName: string; reason: string }>;
}

export interface EnrichmentContact {
  fullName: string | null;
  roleTitle: string | null;
  department?: string | null;
  email: string | null;
  emailStatus: 'unknown' | 'guessed' | 'verified' | 'invalid' | 'risky';
  linkedinUrl?: string | null;
  source: string | null;
  confidence: number | null;
}

export interface EnrichmentResult {
  company: {
    domain: string | null;
    employeeCountEstimate: string | null;
    industry: string | null;
    region: string | null;
  };
  contacts: EnrichmentContact[];
}

export interface OutreachDraft {
  contactId?: string | null;
  channel: 'email' | 'linkedin_manual';
  sequenceStep: number;
  subject: string | null;
  body: string;
  personalizationBasis: {
    evidenceIds: string[];
    reasoning: string[];
  };
}

export interface DraftOutreachResult {
  drafts: OutreachDraft[];
}

export interface ReplyClassificationResult {
  classification:
    | 'interested'
    | 'not_now'
    | 'wrong_person'
    | 'unsubscribe'
    | 'objection'
    | 'meeting_requested'
    | 'negative'
    | 'auto_reply'
    | 'unknown';
  suggestedNextAction:
    | 'book_meeting'
    | 'send_answer'
    | 'follow_up_later'
    | 'ask_for_referral'
    | 'suppress_contact'
    | 'suppress_domain'
    | 'no_action'
    | 'review_manually';
  confidence: number;
  summary: string;
  followUpSuggestion: string | null;
}

const SOURCE_TYPES = new Set(['web', 'news', 'reddit', 'hacker_news', 'ats', 'manual', 'linkedin_manual']);
const SIGNAL_TYPES = new Set([
  'active_engineering_hiring',
  'ai_hiring_change',
  'hiring_pipeline_pain',
  'technical_assessment_fit',
  'funding_or_growth',
  'manual_signal',
]);
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

function cleanString(value: unknown, field: string, max = 500) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim().slice(0, max);
}

function cleanOptionalString(value: unknown, max = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanScore(value: unknown, field: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${field} must be numeric`);
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function cleanStringArray(value: unknown, field: string, allowed?: Set<string>) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const cleaned = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (cleaned.length === 0) throw new Error(`${field} must not be empty`);
  if (allowed) {
    for (const item of cleaned) {
      if (!allowed.has(item)) throw new Error(`${field} contains unsupported value: ${item}`);
    }
  }
  return Array.from(new Set(cleaned)).slice(0, 8);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function validateDiscoveryResult(value: unknown, maxProspects = 10): DiscoveryResult {
  const root = asObject(value, 'result');
  const rawProspects = Array.isArray(root.prospects) ? root.prospects : [];
  const rawRejected = Array.isArray(root.rejected) ? root.rejected : [];
  const prospects: DiscoveryProspect[] = [];

  for (const rawProspect of rawProspects.slice(0, maxProspects)) {
    const prospect = asObject(rawProspect, 'prospect');
    const companyName = cleanString(prospect.companyName, 'prospect.companyName', 200);
    const evidenceRows = Array.isArray(prospect.evidence) ? prospect.evidence : [];
    if (evidenceRows.length === 0) {
      throw new Error(`${companyName} must include at least one evidence item`);
    }

    prospects.push({
      companyName,
      domain: cleanOptionalString(prospect.domain, 200),
      industry: cleanOptionalString(prospect.industry, 200),
      region: cleanOptionalString(prospect.region, 120),
      employeeCountEstimate: cleanOptionalString(prospect.employeeCountEstimate, 80),
      fitScore: cleanScore(prospect.fitScore, 'prospect.fitScore'),
      signals: cleanStringArray(prospect.signals, 'prospect.signals', SIGNAL_TYPES),
      scoreReasons: cleanStringArray(prospect.scoreReasons, 'prospect.scoreReasons'),
      evidence: evidenceRows.slice(0, 8).map((rawEvidence, index) => {
        const evidence = asObject(rawEvidence, `prospect.evidence[${index}]`);
        const sourceType = cleanString(evidence.sourceType, 'evidence.sourceType', 80);
        if (!SOURCE_TYPES.has(sourceType)) throw new Error(`unsupported sourceType: ${sourceType}`);
        return {
          sourceType,
          sourceUrl: cleanString(evidence.sourceUrl, 'evidence.sourceUrl', 1000),
          signalType: cleanStringArray([evidence.signalType], 'evidence.signalType', SIGNAL_TYPES)[0],
          summary: cleanString(evidence.summary, 'evidence.summary', 1000),
          quotedText: cleanOptionalString(evidence.quotedText, 1200),
          confidence: evidence.confidence === null || evidence.confidence === undefined
            ? null
            : cleanScore(evidence.confidence, 'evidence.confidence'),
        };
      }),
      recommendedNextStep: cleanOptionalString(prospect.recommendedNextStep, 120) || 'review_for_enrichment',
    });
  }

  return {
    prospects,
    rejected: rawRejected.slice(0, 50).map((raw) => {
      const rejected = asObject(raw, 'rejected');
      return {
        companyName: cleanString(rejected.companyName, 'rejected.companyName', 200),
        reason: cleanString(rejected.reason, 'rejected.reason', 1000),
      };
    }),
  };
}

export function validateEnrichmentResult(value: unknown, maxContacts = 8): EnrichmentResult {
  const root = asObject(value, 'result');
  const company = asObject(root.company ?? {}, 'company');
  const rawContacts = Array.isArray(root.contacts) ? root.contacts : [];

  return {
    company: {
      domain: cleanOptionalString(company.domain, 200),
      employeeCountEstimate: cleanOptionalString(company.employeeCountEstimate, 80),
      industry: cleanOptionalString(company.industry, 200),
      region: cleanOptionalString(company.region, 120),
    },
    contacts: rawContacts.slice(0, maxContacts).map((rawContact, index) => {
      const contact = asObject(rawContact, `contacts[${index}]`);
      const emailStatus = cleanOptionalString(contact.emailStatus, 40) || 'unknown';
      if (!EMAIL_STATUSES.has(emailStatus)) throw new Error(`unsupported emailStatus: ${emailStatus}`);
      return {
        fullName: cleanOptionalString(contact.fullName, 200),
        roleTitle: cleanOptionalString(contact.roleTitle, 200),
        department: cleanOptionalString(contact.department, 120),
        email: cleanOptionalString(contact.email, 300),
        emailStatus: emailStatus as EnrichmentContact['emailStatus'],
        linkedinUrl: cleanOptionalString(contact.linkedinUrl, 1000),
        source: cleanOptionalString(contact.source, 200),
        confidence: contact.confidence === null || contact.confidence === undefined
          ? null
          : cleanScore(contact.confidence, 'contact.confidence'),
      };
    }).filter((contact) => contact.fullName || contact.roleTitle || contact.email || contact.linkedinUrl),
  };
}

export function validateDraftOutreachResult(value: unknown, maxDrafts = 8): DraftOutreachResult {
  const root = asObject(value, 'result');
  const rawDrafts = Array.isArray(root.drafts) ? root.drafts : [];

  return {
    drafts: rawDrafts.slice(0, maxDrafts).map((rawDraft, index) => {
      const draft = asObject(rawDraft, `drafts[${index}]`);
      const channel = cleanString(draft.channel, 'draft.channel', 40);
      if (!DRAFT_CHANNELS.has(channel)) throw new Error(`unsupported draft channel: ${channel}`);

      const basis = asObject(draft.personalizationBasis ?? {}, 'draft.personalizationBasis');
      const sequenceStep = Number(draft.sequenceStep ?? 1);

      return {
        contactId: cleanOptionalString(draft.contactId, 120),
        channel: channel as OutreachDraft['channel'],
        sequenceStep: Number.isFinite(sequenceStep) ? Math.max(1, Math.min(5, Math.round(sequenceStep))) : 1,
        subject: channel === 'email' ? cleanString(draft.subject, 'draft.subject', 200) : cleanOptionalString(draft.subject, 200),
        body: cleanString(draft.body, 'draft.body', 4000),
        personalizationBasis: {
          evidenceIds: Array.isArray(basis.evidenceIds)
            ? basis.evidenceIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean).slice(0, 10)
            : [],
          reasoning: Array.isArray(basis.reasoning)
            ? basis.reasoning.map((reason) => (typeof reason === 'string' ? reason.trim().slice(0, 500) : '')).filter(Boolean).slice(0, 10)
            : [],
        },
      };
    }).filter((draft) => draft.body),
  };
}

export function validateReplyClassificationResult(value: unknown): ReplyClassificationResult {
  const root = asObject(value, 'result');
  const classification = cleanString(root.classification, 'classification', 80);
  const suggestedNextAction = cleanString(root.suggestedNextAction, 'suggestedNextAction', 80);
  if (!REPLY_CLASSIFICATIONS.has(classification)) {
    throw new Error(`unsupported reply classification: ${classification}`);
  }
  if (!NEXT_ACTIONS.has(suggestedNextAction)) {
    throw new Error(`unsupported suggestedNextAction: ${suggestedNextAction}`);
  }

  return {
    classification: classification as ReplyClassificationResult['classification'],
    suggestedNextAction: suggestedNextAction as ReplyClassificationResult['suggestedNextAction'],
    confidence: cleanScore(root.confidence ?? 50, 'confidence'),
    summary: cleanString(root.summary, 'summary', 1000),
    followUpSuggestion: cleanOptionalString(root.followUpSuggestion, 1200),
  };
}
