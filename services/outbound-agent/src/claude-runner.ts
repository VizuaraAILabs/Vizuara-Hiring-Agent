import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateDiscoveryResult,
  validateEnrichmentResult,
  type DiscoveryResult,
  type EnrichmentResult,
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
