import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an expert challenge designer for ArcEval, a platform that evaluates how software engineers collaborate with AI coding assistants.

Your job is to design coding challenges that specifically test a candidate's ability to work WITH an AI assistant effectively — not just their raw coding ability.

Key principles for every challenge you create:
- Every challenge MUST require multiple distinct steps that cannot be solved with a single AI prompt
- Include natural decision points where the candidate must choose between approaches
- The challenge should reveal how candidates decompose problems, iterate on AI suggestions, and apply critical thinking
- Challenges should be realistic and reflect actual work scenarios
- Include requirements that test debugging, adaptation, and integration — not just greenfield coding

Format every challenge description with these sections:
## Objective
A clear 2-3 sentence description of what the candidate will build or accomplish.

## Context
Brief background on why this task matters and any relevant domain context.

## Requirements
5-8 numbered requirements, ordered from foundational to advanced. Include at least one requirement that involves:
- Integrating or modifying existing code/systems
- A non-obvious edge case or constraint
- A design decision with trade-offs

## Evaluation Criteria
- How the candidate breaks down the problem into steps
- Quality of their prompts and interactions with the AI assistant
- How they handle unexpected results or errors
- Whether they verify and test AI-generated code
- Their ability to make architectural decisions independently

Return your response as JSON with this exact structure:
{ "challenges": [...] }

Each challenge object must have:
- title (string): A concise, descriptive title
- description (string): The full challenge description in markdown with the sections above
- difficulty (string): One of "beginner", "intermediate", "advanced", "expert"
- duration_minutes (number): Always set to 30. Do NOT vary this value — assessment duration is configured separately by the hiring team.
- tags (string[]): 3-6 relevant technology/skill tags
- why_iterative (string): 2-3 sentences explaining why this challenge specifically tests multi-step AI collaboration skills`;

function buildUserPrompt(body: {
  role: string;
  tech_stack: string[];
  seniority: string;
  focus_areas: string[];
  context?: string;
}): string {
  const seniorityMap: Record<string, { label: string; difficulty: string }> = {
    junior: { label: 'Junior (0-2 years)', difficulty: 'beginner to intermediate' },
    mid: { label: 'Mid-Level (2-5 years)', difficulty: 'intermediate' },
    senior: { label: 'Senior (5-8 years)', difficulty: 'advanced' },
    staff: { label: 'Staff/Principal (8+ years)', difficulty: 'expert' },
  };

  const info = seniorityMap[body.seniority] || seniorityMap.mid;

  let prompt = `Generate 3-5 coding challenges for a ${info.label} ${body.role} engineer.

Tech stack: ${body.tech_stack.join(', ')}
Focus areas: ${body.focus_areas.join(', ')}
Target difficulty: ${info.difficulty}

Set duration_minutes to 30 for every challenge. The hiring team configures the actual time limit separately.
Each challenge must be appropriate for the seniority level. Include a "why_iterative" field explaining why multi-step AI collaboration is needed for each challenge.`;

  if (body.context) {
    prompt += `\n\nAdditional context from the hiring company:\n${body.context}`;
  }

  return prompt;
}

async function callGemini(userPrompt: string, retry = false): Promise<{ challenges: unknown[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
          temperature: 0.8,
          maxOutputTokens: 8192,
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
      if (!parsed.challenges || !Array.isArray(parsed.challenges)) {
        throw new Error('INVALID_STRUCTURE');
      }
      return parsed;
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
    const { role, tech_stack, seniority, focus_areas, context } = body;

    if (!role || !tech_stack?.length || !seniority || !focus_areas?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: role, tech_stack, seniority, focus_areas' },
        { status: 400 }
      );
    }

    const userPrompt = buildUserPrompt({ role, tech_stack, seniority, focus_areas, context });
    const result = await callGemini(userPrompt);

    return NextResponse.json({
      challenges: result.challenges,
      model: 'gemini-2.5-flash',
      generated_at: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Challenge generation error:', message);

    if (message === 'GEMINI_API_KEY_MISSING') {
      return NextResponse.json(
        { error: 'AI generation service is not configured. Please contact support.' },
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
        { error: 'Failed to generate valid challenges. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
