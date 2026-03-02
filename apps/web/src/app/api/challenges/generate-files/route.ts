import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an expert at creating coding challenge starter files for ArcEval, a platform that evaluates how software engineers collaborate with AI coding assistants.

Given a challenge title and description, generate the appropriate starter files that should be pre-populated in the candidate's workspace.

Rules:
- Generate realistic, well-structured project scaffolds
- Include a README.md or BRIEF.md with setup instructions and the challenge objective
- Include relevant config files (package.json, requirements.txt, tsconfig.json, etc.)
- Include source code stubs with TODO comments where candidates should implement
- Include test files when the challenge involves testing or verification
- Include any data files mentioned in the requirements (use realistic sample data)
- Keep file content concise but functional — candidates should be able to run the project immediately after installing dependencies
- Use the tech stack implied by the challenge description
- Use forward slashes in file paths

Return your response as JSON with this exact structure:
{ "files": [ { "path": "relative/path/file.ext", "content": "file content here" } ] }

Every file must have a "path" (string, relative, using forward slashes) and "content" (string, the full file content).`;

function validateFiles(files: unknown[]): { path: string; content: string }[] {
  const validated: { path: string; content: string }[] = [];
  for (const file of files) {
    if (
      typeof file !== 'object' || file === null ||
      typeof (file as any).path !== 'string' ||
      typeof (file as any).content !== 'string'
    ) {
      continue;
    }
    const p = (file as any).path as string;
    // Reject path traversal and absolute paths
    if (p.includes('..') || p.startsWith('/') || p.includes('\0')) {
      continue;
    }
    validated.push({ path: p, content: (file as any).content });
  }
  return validated;
}

async function callGemini(userPrompt: string, retry = false): Promise<{ files: { path: string; content: string }[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const finalUserPrompt = retry
      ? userPrompt + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no extra text.'
      : userPrompt;

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: finalUserPrompt }] },
        ],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Gemini API error:', res.status, errBody);
      throw new Error(`GEMINI_API_ERROR: ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('GEMINI_EMPTY_RESPONSE');
    }

    try {
      const parsed = JSON.parse(text);
      if (!parsed.files || !Array.isArray(parsed.files)) {
        throw new Error('INVALID_STRUCTURE');
      }
      const files = validateFiles(parsed.files);
      if (files.length === 0) {
        throw new Error('INVALID_STRUCTURE');
      }
      return { files };
    } catch {
      if (!retry) {
        return callGemini(userPrompt, true);
      }
      throw new Error('GEMINI_INVALID_JSON');
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const userPrompt = `Challenge Title: ${title}\n\nChallenge Description:\n${description}`;
    const result = await callGemini(userPrompt);

    return NextResponse.json({ files: result.files });
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
        { error: 'Failed to generate valid starter files. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
