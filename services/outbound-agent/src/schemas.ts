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

const SOURCE_TYPES = new Set(['web', 'news', 'reddit', 'hacker_news', 'ats', 'manual', 'linkedin_manual']);
const SIGNAL_TYPES = new Set([
  'active_engineering_hiring',
  'ai_hiring_change',
  'hiring_pipeline_pain',
  'technical_assessment_fit',
  'funding_or_growth',
  'manual_signal',
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
