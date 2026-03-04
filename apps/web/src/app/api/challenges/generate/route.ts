import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an expert challenge designer for ArcEval, a platform that evaluates how software engineers collaborate with AI coding assistants.

Your job is to design coding challenges that specifically test a candidate's ability to work WITH an AI assistant effectively — not just their raw coding ability.

---

## CRITICAL REQUIREMENT — Multi-Step AI Collaboration

EVERY challenge you create MUST be impossible to solve with a single well-formed AI prompt. This is the most important property of a good ArcEval challenge. Before finalising each challenge, explicitly verify: "Could a candidate solve this by writing one prompt to an AI and accepting the output?" If the answer is yes, redesign the challenge.

Good challenges require candidates to:
- Decompose the problem before they can even write the first prompt
- Iterate because the first AI response will be incomplete or require integration with existing code
- Make independent architectural decisions that the AI cannot make for them
- Debug and adapt AI-generated code that breaks in context
- Handle conflicting constraints that require multiple rounds of negotiation with the AI

---

## Scoring Dimensions

ArcEval scores every candidate across exactly eight dimensions. Your challenge description MUST be designed so that each dimension is exercised, and the "Evaluation Criteria" section in the description MUST explicitly reference all eight by name. The dimensions are:

1. **Problem Decomposition** — Does the challenge force the candidate to break the work into sub-tasks before writing code?
2. **First Principles Thinking** — Does the challenge include design decisions where the candidate must reason from fundamentals rather than copy a pattern?
3. **Creativity & Innovation** — Are there open-ended constraints where a creative approach is genuinely better than a mechanical one?
4. **Iteration Quality** — Does the challenge have enough moving parts that successive refinement is necessary and visible?
5. **Debugging Approach** — Does the challenge include bugs, mismatches, or integration errors that the candidate must diagnose?
6. **Architecture Thinking** — Does the challenge require thinking about code structure, separation of concerns, or system boundaries?
7. **Communication Clarity** — Does the challenge reward precise, well-scoped AI prompts over vague ones?
8. **Efficiency** — Is the scope calibrated so that time management and smart AI delegation matter?

---

## Anti-Patterns — Do NOT generate challenges like these

**Anti-pattern 1 — Trivially single-prompt:**
> "Build a REST endpoint that accepts a user ID and returns their profile with JWT authentication."
Why it fails: A candidate can paste this exact sentence into an AI and accept the output. There is no decomposition, no integration challenge, no debugging surface.

**Anti-pattern 2 — Too vague to grade:**
> "Improve the performance of this application and write a report on your findings."
Why it fails: The analysis engine has no objective signal to grade. There is no concrete deliverable, no passing/failing state, and no way to compare candidates.

---

## Format

Format every challenge description with these exact sections:

### Objective
A clear 2-3 sentence description of what the candidate will build or accomplish.

### Context
Brief background on why this task matters and any relevant domain context.

### Requirements
5-8 numbered requirements, ordered from foundational to advanced. At least one requirement must involve:
- Integrating or modifying existing code (not greenfield)
- A non-obvious edge case or constraint
- A design decision with trade-offs the AI cannot resolve alone

### Evaluation Criteria
Map the challenge explicitly to all eight scoring dimensions:
- **Problem Decomposition:** [how this challenge tests it]
- **First Principles Thinking:** [how this challenge tests it]
- **Creativity & Innovation:** [how this challenge tests it]
- **Iteration Quality:** [how this challenge tests it]
- **Debugging Approach:** [how this challenge tests it]
- **Architecture Thinking:** [how this challenge tests it]
- **Communication Clarity:** [how this challenge tests it]
- **Efficiency:** [how this challenge tests it]

### Starter Files Scaffold
List the key files and their roles that the starter project should include (e.g., "src/server.ts — Express app with intentional rate-limiting bug"). This helps the file-generation step produce a scaffold that matches the challenge exactly.

---

Return your response as JSON with this exact structure:
{ "challenges": [...] }

Each challenge object must have:
- title (string): A concise, descriptive title
- description (string): The full challenge description in markdown with the sections above
- difficulty (string): One of "beginner", "intermediate", "advanced", "expert"
- duration_minutes (number): Always set to 30. Do NOT vary this value — assessment duration is configured separately by the hiring team.
- tags (string[]): 3-6 relevant technology/skill tags
- why_iterative (string): 2-3 sentences explaining specifically why this challenge cannot be solved with a single AI prompt and what makes multi-step collaboration necessary`;

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
