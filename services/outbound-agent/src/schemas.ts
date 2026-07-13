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
