import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateDraftOutreachResult,
  validateDiscoveryResult,
  validateEnrichmentResult,
  validateReplyClassificationResult,
  type DraftOutreachResult,
  type DiscoveryResult,
  type EnrichmentResult,
  type ReplyClassificationResult,
  type RunRequest,
} from './schemas.js';

const here = dirname(fileURLToPath(import.meta.url));

function mockDiscoveryResult(): DiscoveryResult {
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

function mockEnrichmentResult(request: RunRequest): EnrichmentResult {
  const companyName = typeof request.config?.companyName === 'string'
    ? request.config.companyName
    : 'Northstar Robotics';
  const domain = typeof request.config?.domain === 'string'
    ? request.config.domain
    : 'northstar-robotics.example';

  return {
    company: {
      domain,
      employeeCountEstimate: '100-500',
      industry: 'Robotics software',
      region: 'US',
    },
    contacts: [
      {
        fullName: 'Alex Morgan',
        roleTitle: 'Head of Talent',
        department: 'Talent',
        email: `alex@${domain}`,
        emailStatus: 'guessed',
        linkedinUrl: null,
        source: `Mock public company research for ${companyName}`,
        confidence: 62,
      },
      {
        fullName: 'Priya Shah',
        roleTitle: 'VP Engineering',
        department: 'Engineering',
        email: null,
        emailStatus: 'unknown',
        linkedinUrl: null,
        source: `Mock leadership page for ${companyName}`,
        confidence: 70,
      },
    ],
  };
}

function mockDraftOutreachResult(request: RunRequest): DraftOutreachResult {
  const companyName = typeof request.config?.companyName === 'string'
    ? request.config.companyName
    : 'Northstar Robotics';
  const contacts = Array.isArray(request.config?.contacts)
    ? request.config.contacts as Array<Record<string, unknown>>
    : [];
  const contact = contacts[0] ?? {};
  const contactId = typeof contact.id === 'string' ? contact.id : null;
  const firstName = typeof contact.fullName === 'string' && contact.fullName.trim()
    ? contact.fullName.trim().split(/\s+/)[0]
    : 'there';
  const evidence = Array.isArray(request.config?.evidence)
    ? request.config.evidence as Array<Record<string, unknown>>
    : [];
  const evidenceIds = evidence
    .map((item) => (typeof item.id === 'string' ? item.id : ''))
    .filter(Boolean)
    .slice(0, 2);

  return {
    drafts: [
      {
        contactId,
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
        contactId,
        channel: 'email',
        sequenceStep: 2,
        subject: 'Quick follow-up',
        body: `Hi ${firstName},\n\nQuick follow-up in case this is timely for ${companyName}. ArcEval is built for teams that want signal on real AI-native work instead of resume filters or trivia screens.\n\nHappy to send a short example assessment flow if useful.`,
        personalizationBasis: {
          evidenceIds,
          reasoning: ['Follow-up keeps the same evidence-backed hiring context without adding unsupported claims.'],
        },
      },
      {
        contactId,
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

function mockReplyClassificationResult(request: RunRequest): ReplyClassificationResult {
  const replyText = typeof request.config?.replyText === 'string'
    ? request.config.replyText.toLowerCase()
    : '';
  if (replyText.includes('unsubscribe') || replyText.includes('remove me')) {
    return {
      classification: 'unsubscribe',
      suggestedNextAction: 'suppress_contact',
      confidence: 90,
      summary: 'The reply asks to stop future outreach.',
      followUpSuggestion: null,
    };
  }
  if (replyText.includes('meeting') || replyText.includes('calendar') || replyText.includes('interested')) {
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
    summary: 'Mock classification could not infer a clear buying intent.',
    followUpSuggestion: 'Review the reply manually before responding.',
  };
}

function safeRunId(runId: string) {
  return runId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function maxRuntimeMs(request: RunRequest) {
  const raw = Number(request.config?.maxRuntimeMinutes ?? 8);
  const minutes = Number.isFinite(raw) ? Math.max(1, Math.min(20, raw)) : 8;
  return minutes * 60 * 1000;
}

function maxProspects(request: RunRequest) {
  const raw = Number(request.config?.maxProspects ?? 10);
  return Number.isFinite(raw) ? Math.max(1, Math.min(25, Math.round(raw))) : 10;
}

function maxContacts(request: RunRequest) {
  const raw = Number(request.config?.maxContacts ?? 8);
  return Number.isFinite(raw) ? Math.max(1, Math.min(15, Math.round(raw))) : 8;
}

function maxDrafts(request: RunRequest) {
  const raw = Number(request.config?.maxDrafts ?? 8);
  return Number.isFinite(raw) ? Math.max(1, Math.min(12, Math.round(raw))) : 8;
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Claude Code did not return a JSON object');
  }
  return candidate.slice(start, end + 1);
}

function runCommand(options: {
  command: string;
  args: string[];
  input: string;
  cwd: string;
  timeoutMs: number;
}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Claude Code timed out after ${Math.round(options.timeoutMs / 1000)}s`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Claude Code exited with ${code}: ${stderr || stdout}`.slice(0, 2000)));
        return;
      }
      resolve({ stdout, stderr });
    });

    child.stdin.write(options.input);
    child.stdin.end();
  });
}

async function buildDiscoveryPrompt(request: RunRequest) {
  const basePrompt = await readFile(join(here, 'prompts', 'discovery.md'), 'utf8');
  return `${basePrompt}

Run ID: ${request.runId}

Discovery config:
${JSON.stringify(request.config ?? {}, null, 2)}

Required JSON shape:
{
  "prospects": [
    {
      "companyName": "Example AI",
      "domain": "example.ai",
      "industry": "B2B SaaS",
      "region": "US",
      "employeeCountEstimate": "100-500",
      "fitScore": 84,
      "signals": ["active_engineering_hiring", "ai_hiring_change"],
      "scoreReasons": ["Specific reason backed by evidence"],
      "evidence": [
        {
          "sourceType": "ats",
          "sourceUrl": "https://example.ai/careers",
          "signalType": "active_engineering_hiring",
          "summary": "Company lists relevant engineering roles.",
          "quotedText": "Senior ML Infrastructure Engineer",
          "confidence": 85
        }
      ],
      "recommendedNextStep": "review_for_enrichment"
    }
  ],
  "rejected": [
    {
      "companyName": "Weak Fit Co",
      "reason": "Hiring signal found, but evidence was weak."
    }
  ]
}

Return only valid JSON. Do not include markdown or commentary.`;
}

async function buildEnrichmentPrompt(request: RunRequest) {
  const basePrompt = await readFile(join(here, 'prompts', 'enrichment.md'), 'utf8');
  return `${basePrompt}

Run ID: ${request.runId}

Prospect and evidence:
${JSON.stringify(request.config ?? {}, null, 2)}

Required JSON shape:
{
  "company": {
    "domain": "example.ai",
    "employeeCountEstimate": "100-500",
    "industry": "AI infrastructure",
    "region": "US"
  },
  "contacts": [
    {
      "fullName": "Jane Doe",
      "roleTitle": "Head of Talent",
      "department": "Talent",
      "email": "jane@example.ai",
      "emailStatus": "guessed",
      "linkedinUrl": null,
      "source": "Public company page",
      "confidence": 70
    }
  ]
}

Return only valid JSON. Do not include markdown or commentary.`;
}

async function buildDraftOutreachPrompt(request: RunRequest) {
  const basePrompt = await readFile(join(here, 'prompts', 'outreach-draft.md'), 'utf8');
  return `${basePrompt}

Run ID: ${request.runId}

Prospect, contacts, and evidence:
${JSON.stringify(request.config ?? {}, null, 2)}

Required JSON shape:
{
  "drafts": [
    {
      "contactId": "contact-uuid-or-null",
      "channel": "email",
      "sequenceStep": 1,
      "subject": "Short subject",
      "body": "Plain text body",
      "personalizationBasis": {
        "evidenceIds": ["evidence-uuid"],
        "reasoning": ["Why the personalized claim is supported by stored evidence."]
      }
    },
    {
      "contactId": "contact-uuid-or-null",
      "channel": "linkedin_manual",
      "sequenceStep": 1,
      "subject": null,
      "body": "Manual LinkedIn note or DM draft",
      "personalizationBasis": {
        "evidenceIds": ["evidence-uuid"],
        "reasoning": ["Why the note is supported by stored evidence."]
      }
    }
  ]
}

Return only valid JSON. Do not include markdown or commentary.`;
}

async function buildReplyClassificationPrompt(request: RunRequest) {
  const basePrompt = await readFile(join(here, 'prompts', 'reply-classifier.md'), 'utf8');
  return `${basePrompt}

Run ID: ${request.runId}

Reply context:
${JSON.stringify(request.config ?? {}, null, 2)}

Required JSON shape:
{
  "classification": "interested",
  "suggestedNextAction": "send_answer",
  "confidence": 80,
  "summary": "One-sentence classification rationale.",
  "followUpSuggestion": "A short admin-reviewed follow-up suggestion, or null."
}

Allowed classifications:
interested, not_now, wrong_person, unsubscribe, objection, meeting_requested, negative, auto_reply, unknown

Allowed suggestedNextAction:
book_meeting, send_answer, follow_up_later, ask_for_referral, suppress_contact, suppress_domain, no_action, review_manually

Return only valid JSON. Do not include markdown or commentary.`;
}

async function runClaudeJson(request: RunRequest, prompt: string) {
  const workspace = join(tmpdir(), 'arceval-outbound', safeRunId(request.runId));
  await mkdir(workspace, { recursive: true });

  await writeFile(join(workspace, 'input.json'), JSON.stringify(request, null, 2));
  await writeFile(join(workspace, 'prompt.md'), prompt);

  const { stdout, stderr } = await runCommand({
    command: 'claude',
    args: ['--print'],
    input: prompt,
    cwd: workspace,
    timeoutMs: maxRuntimeMs(request),
  });

  await writeFile(join(workspace, 'stdout.txt'), stdout);
  if (stderr.trim()) await writeFile(join(workspace, 'stderr.txt'), stderr);

  return { workspace, parsed: JSON.parse(extractJsonObject(stdout)) };
}

export async function runDiscovery(request: RunRequest): Promise<DiscoveryResult> {
  if (process.env.OUTBOUND_AGENT_USE_MOCK === 'true') {
    return mockDiscoveryResult();
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required unless OUTBOUND_AGENT_USE_MOCK=true');
  }

  const prompt = await buildDiscoveryPrompt(request);
  const { workspace, parsed } = await runClaudeJson(request, prompt);
  const result = validateDiscoveryResult(parsed, maxProspects(request));
  await writeFile(join(workspace, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

export async function runEnrichment(request: RunRequest): Promise<EnrichmentResult> {
  if (process.env.OUTBOUND_AGENT_USE_MOCK === 'true') {
    return mockEnrichmentResult(request);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required unless OUTBOUND_AGENT_USE_MOCK=true');
  }

  const prompt = await buildEnrichmentPrompt(request);
  const { workspace, parsed } = await runClaudeJson(request, prompt);
  const result = validateEnrichmentResult(parsed, maxContacts(request));
  await writeFile(join(workspace, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

export async function runDraftOutreach(request: RunRequest): Promise<DraftOutreachResult> {
  if (process.env.OUTBOUND_AGENT_USE_MOCK === 'true') {
    return mockDraftOutreachResult(request);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required unless OUTBOUND_AGENT_USE_MOCK=true');
  }

  const prompt = await buildDraftOutreachPrompt(request);
  const { workspace, parsed } = await runClaudeJson(request, prompt);
  const result = validateDraftOutreachResult(parsed, maxDrafts(request));
  await writeFile(join(workspace, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

export async function runReplyClassification(request: RunRequest): Promise<ReplyClassificationResult> {
  if (process.env.OUTBOUND_AGENT_USE_MOCK === 'true') {
    return mockReplyClassificationResult(request);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required unless OUTBOUND_AGENT_USE_MOCK=true');
  }

  const prompt = await buildReplyClassificationPrompt(request);
  const { workspace, parsed } = await runClaudeJson(request, prompt);
  const result = validateReplyClassificationResult(parsed);
  await writeFile(join(workspace, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}
