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
