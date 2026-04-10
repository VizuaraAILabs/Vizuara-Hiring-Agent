import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { Challenge } from '@/types';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an expert software engineer who creates realistic starter project codebases for ArcEval coding challenges.

ArcEval challenges are specifically designed to require multi-step AI collaboration — candidates must decompose the problem, iterate, debug integration errors, and make architectural decisions that a single AI prompt cannot resolve. Your starter files must support this: the codebase should be realistic enough that AI-generated code doesn't "just work" — it must be integrated, tested, and refined.

Given a challenge title and description, generate a complete set of starter project files. Pay close attention to any "Starter Files Scaffold" section in the challenge description — it lists the specific files and their intended roles. If that section is present, use it as the blueprint for your file structure.

The project should:

1. Be a realistic, working codebase that matches the challenge description exactly — the file structure, naming, and technology must align with what the challenge describes
2. Contain intentional issues that the challenge asks candidates to fix (e.g., unoptimized code, monolithic components, missing features, poor error handling — whatever the challenge requires). These issues must be specific and match the challenge requirements, not generic placeholder problems
3. Include all necessary config files (package.json, tsconfig.json, etc.) so the project can be installed and run
4. Have enough code to be meaningful but not so much that it's overwhelming (typically 5-15 files)
5. Use realistic variable names, comments, and structure — like a real codebase someone would encounter on the job
6. Include at least one deliberate integration point where AI-generated code from one file must be wired into another — this surfaces the multi-step, iterative nature of the challenge

IMPORTANT rules:
- Return ONLY a JSON object with a "files" array
- Each file object must have "path" (relative path like "src/App.tsx") and "content" (full file content as a string)
- Do NOT include node_modules, lock files, or .git directories
- Include a README.md with basic setup instructions (npm install && npm start or similar)
- Make sure the code has the specific problems the challenge asks candidates to fix
- The project should be runnable after npm install

Return format:
{
  "files": [
    { "path": "package.json", "content": "..." },
    { "path": "src/index.ts", "content": "..." }
  ]
}`;

function buildPrompt(title: string, description: string): string {
  return `Generate a starter project codebase for the following coding challenge:

## Challenge Title
${title}

## Challenge Description
${description}

Generate all the files needed for a candidate to start working on this challenge. The project should compile/run but contain the specific issues described in the challenge for the candidate to fix.`;
}

function getGeminiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY ?? '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

async function callGeminiWithKey(apiKey: string, prompt: string): Promise<{ path: string; content: string }[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s — file generation takes longer

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
        ],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Gemini API error (generate-files):', res.status, errBody);
      throw new Error(`GEMINI_API_ERROR: ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('GEMINI_EMPTY_RESPONSE');
    }

    const parsed = JSON.parse(text);
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('INVALID_STRUCTURE');
    }
    for (const file of parsed.files) {
      if (typeof file.path !== 'string' || typeof file.content !== 'string') {
        throw new Error('INVALID_FILE_ENTRY');
      }
    }
    return parsed.files;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(prompt: string, retry = false): Promise<{ path: string; content: string }[]> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const finalPrompt = retry
    ? prompt + '\n\nIMPORTANT: Return ONLY valid JSON with a "files" array. No markdown fences, no extra text.'
    : prompt;

  let lastError: Error = new Error('GEMINI_API_ERROR: unknown');
  for (const key of keys) {
    console.log(`Trying Gemini key: ${key}`);
    try {
      return await callGeminiWithKey(key, finalPrompt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('GEMINI_API_ERROR: unknown');
      console.warn(`Gemini key failed, trying next. Error: ${lastError.message}`);
    }
  }

  // All keys failed — retry once with JSON reminder if not already retried
  if (!retry) {
    return callGemini(prompt, true);
  }

  throw lastError;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify challenge exists and belongs to this company
    const [challenge] = await sql<Challenge[]>`
      SELECT * FROM challenges WHERE id = ${id}
    `;

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate starter files using Gemini
    const files = await callGemini(buildPrompt(challenge.title, challenge.description));

    // Store in database
    await sql`
      UPDATE challenges SET starter_files = ${JSON.stringify(files)}::jsonb WHERE id = ${id}
    `;

    return NextResponse.json({
      files: files.map(f => ({ path: f.path, size: f.content.length })),
      count: files.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Starter file generation error:', message);

    if (message === 'GEMINI_API_KEY_MISSING') {
      return NextResponse.json(
        { error: 'AI generation service is not configured.' },
        { status: 503 }
      );
    }

    if (message.startsWith('GEMINI_API_ERROR')) {
      return NextResponse.json(
        { error: 'AI generation service is temporarily unavailable. Please try again.' },
        { status: 500 }
      );
    }

    if (message === 'GEMINI_INVALID_JSON' || message === 'GEMINI_EMPTY_RESPONSE') {
      return NextResponse.json(
        { error: 'Failed to generate starter files. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong generating starter files.' },
      { status: 500 }
    );
  }
}
