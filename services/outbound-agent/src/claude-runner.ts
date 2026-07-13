import type { DiscoveryResult, RunRequest } from './schemas.js';

export async function runDiscovery(_request: RunRequest): Promise<DiscoveryResult> {
  // Phase 1 contract test: this mock exercises the Cloud Run -> ArcEval result path.
  // The real runner will create a temp workspace and invoke Claude Code with the
  // discovery prompt while preserving this output shape.
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
        recommendedNextStep: 'review_for_enrichment',
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
        recommendedNextStep: 'review_for_enrichment',
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
