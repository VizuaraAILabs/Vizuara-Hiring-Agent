# Concrete Skill Signals Spec

## Purpose

ArcEval should keep its current eight public scoring dimensions, but make each
dimension concrete by scoring it through observable behavioral signals. The
current dimensions are useful as report categories and database/API fields, but
they can feel vague when shown only as radar-chart labels.

This spec defines a more concrete analysis layer based on
`docs/CORE_ANALYSIS_METRICS.md`. The goal is to make every score explainable
through transcript evidence from:

- candidate terminal activity,
- candidate prompts to Claude Code,
- AI assistant responses the candidate accepts, questions, rejects, or verifies,
- code edits and file inspection,
- test/debug cycles,
- AI Interviewer questions and candidate replies.

The metrics should be treated as evolving product vocabulary. The database/API
should not require a schema change every time the signal list changes.

## Product Decision

Do not replace the existing eight dimensions yet.

Keep these as the stable public report dimensions:

1. `problem_decomposition`
2. `first_principles`
3. `creativity`
4. `iteration_quality`
5. `debugging_approach`
6. `architecture_thinking`
7. `communication_clarity`
8. `efficiency`

Add concrete behavioral signals underneath them. Reports should explain a score
by showing which signals were observed, which were absent, and which transcript
quotes support the conclusion.

This preserves compatibility with:

- `analysis_results` numeric columns,
- `dimension_details` JSONB,
- report UI,
- shared report pages,
- CSV exports,
- public candidate-analysis API,
- historical reports.

## Concrete Behavioral Signals

### AI Grilling

The candidate critically questions AI-generated output instead of accepting it
blindly.

Positive evidence:

- asks why an AI suggestion works,
- asks the AI to justify trade-offs or assumptions,
- requests failure cases or edge cases,
- challenges an AI answer that conflicts with code or requirements,
- asks for a simpler or safer alternative.

Negative evidence:

- accepts generated code without reading or testing it,
- treats AI output as ground truth when the codebase says otherwise,
- repeats the same AI prompt after bad output without narrowing the issue.

### Calibrated AI Trust

The candidate uses AI productively while retaining ownership of judgment.

Positive evidence:

- delegates suitable research, boilerplate, or test-generation tasks to AI,
- independently verifies AI output,
- pushes back when the AI is incomplete or wrong,
- uses AI to improve their own understanding.

Important nuance:

- low AI usage is not automatically negative,
- no trust in AI is neutral unless it creates avoidable inefficiency,
- blind trust is a strong negative signal.

### Direct Code Inspection

The candidate reads the relevant files directly when uncertain.

Positive evidence:

- opens files before editing them,
- traces definitions, imports, call sites, route handlers, or schemas,
- uses the codebase as source of truth,
- checks generated or AI-suggested claims against real code.

Negative evidence:

- asks the AI to guess behavior without inspecting files,
- edits likely files without confirming ownership or dependencies,
- relies on stale assumptions when direct inspection was available.

### Code Comprehension Questions

The candidate asks targeted questions about specific code behavior, intent, or
dependencies.

Positive evidence:

- asks what a function/module does after locating it,
- asks why a state transition or data shape exists,
- asks about edge cases, invariants, or ownership boundaries,
- asks questions at the right abstraction level before changing code.

Negative evidence:

- asks broad, vague questions when a specific code path is visible,
- asks for a full rewrite without understanding local constraints.

### Problem And Domain Understanding

The candidate demonstrates understanding of the problem, domain, constraints,
and expected behavior independent of AI usage.

Positive evidence:

- restates the task accurately,
- identifies domain constraints,
- explains trade-offs in product or engineering terms,
- asks clarifying questions tied to the actual problem.

Negative evidence:

- solves a different problem,
- ignores explicit requirements,
- proposes technically plausible but domain-inappropriate changes.

### Care About Clean Code

The candidate values maintainable, readable, appropriately organized code.

Positive evidence:

- preserves local style,
- chooses clear names,
- avoids unnecessary duplication,
- keeps related behavior together,
- leaves code easier to understand.

Negative evidence:

- introduces tangled or inconsistent structure,
- spreads one concern across unrelated files,
- creates opaque abstractions without need.

### Care About Simple Code

The candidate chooses the simplest clear solution that satisfies the real
requirements.

Positive evidence:

- avoids over-engineering,
- uses existing helpers and patterns,
- removes complexity when safe,
- explains why a simpler approach is enough.

Negative evidence:

- introduces frameworks, abstractions, or state machinery out of proportion to
  the task,
- chooses cleverness over clarity,
- solves hypothetical future requirements while leaving current behavior weak.

### Care About Optimization

The candidate notices performance, cost, and resource usage when relevant.

Positive evidence:

- identifies hot paths, repeated expensive work, unnecessary network calls, or
  scaling risks,
- balances performance against readability,
- avoids premature optimization when constraints do not justify it.

Scoring rule:

- absence of optimization discussion should not be penalized unless the task
  clearly involves performance, scale, latency, cost, or resource constraints.

### Codebase Mental Mapping

The candidate builds a practical map of the system before changing it.

Positive evidence:

- identifies important files and ignores irrelevant areas,
- traces data flow across frontend, API, database, and services,
- distinguishes source of truth from derived UI,
- understands integration points.

Negative evidence:

- edits one file while missing the route/service/schema that actually controls
  behavior,
- treats symptoms in the UI while missing backend source data.

### Change Impact Awareness

The candidate considers blast radius and existing flows before changing behavior.

Positive evidence:

- asks what else depends on a file, field, route, or rule,
- checks related flows before deleting or narrowing behavior,
- preserves existing behavior unless change is intentional,
- considers migration and backward compatibility.

Negative evidence:

- deletes or changes shared behavior without checking call sites,
- fixes one flow while breaking adjacent flows,
- ignores data/API compatibility.

### Runtime Flow And Event Sequencing

The candidate reasons about order, timing, and state transitions while debugging.

Positive evidence:

- asks what happens first,
- traces state before and after an event,
- identifies race conditions or lifecycle issues,
- distinguishes cause from later symptom,
- tests hypotheses in sequence.

Negative evidence:

- debugs by random edits,
- ignores timing, async boundaries, or state transitions,
- treats final UI state as the only evidence.

### Focused Research Delegation

The candidate delegates bounded research when the environment supports it, or
otherwise performs focused parallel investigation through tools.

Positive evidence:

- gives a narrow research task to a subagent or tool,
- asks it to inspect call sites, schema usage, or risk areas,
- incorporates the returned findings into implementation decisions.

Scoring rule:

- do not penalize candidates when subagents are unavailable,
- credit equivalent focused research using search, file inspection, or targeted
  commands.

## Mapping Signals To Public Dimensions

Each public dimension should be scored from multiple signals. A signal can
contribute to more than one dimension, but the narrative should explain why.

| Public dimension | Primary concrete signals |
|---|---|
| `problem_decomposition` | Problem And Domain Understanding, Codebase Mental Mapping, Code Comprehension Questions |
| `first_principles` | AI Grilling, Runtime Flow And Event Sequencing, Problem And Domain Understanding |
| `creativity` | Productive AI use, alternative exploration, simple/elegant solution discovery |
| `iteration_quality` | Calibrated AI Trust, Direct Code Inspection, Change Impact Awareness |
| `debugging_approach` | Runtime Flow And Event Sequencing, Direct Code Inspection, AI Grilling |
| `architecture_thinking` | Change Impact Awareness, Codebase Mental Mapping, Care About Clean Code, Care About Simple Code |
| `communication_clarity` | Code Comprehension Questions, AI prompt specificity, AI Interviewer dialogue quality |
| `efficiency` | Care About Simple Code, relevant Care About Optimization, Focused Research Delegation |

## Output Shape

The top-level analysis response should keep the existing shape:

```ts
{
  overall_score: number;
  dimensions: Record<DimensionKey, DimensionDetail>;
  key_moments: KeyMoment[];
  timeline_data: TimelineEntry[];
  prompt_complexity: PromptComplexityEntry[];
  category_breakdown: Record<string, number>;
  summary_narrative: string;
  strengths: string[];
  areas_for_growth: string[];
  hiring_recommendation: "strong_yes" | "yes" | "neutral" | "no" | "strong_no";
}
```

Extend each `DimensionDetail` inside `dimension_details` with optional
signal-level fields. These live in JSONB and do not require a database migration.

```ts
type DimensionDetail = {
  score: number;
  narrative: string;
  evidence: string[];
  expected_standard?: string;
  observed_points?: ObservedPoint[];
  signals?: SignalAssessment[];
};

type SignalAssessment = {
  key: string;
  label: string;
  status: "strong" | "present" | "weak" | "absent" | "not_applicable";
  score?: number;
  evidence_quotes: string[];
  explanation: string;
};
```

Example:

```json
{
  "debugging_approach": {
    "score": 72,
    "narrative": "The candidate formed reasonable hypotheses and checked the relevant state flow, but did not fully verify regression behavior.",
    "evidence": [
      "Inspected the drag event handler before editing layout behavior.",
      "Ran the failing interaction once after the first fix."
    ],
    "expected_standard": "A strong candidate would reproduce the drag failure, trace the order of drag-start and movement events, inspect the state transition that hides children, apply a focused fix, and verify both the broken and unaffected flows.",
    "observed_points": [
      {
        "transcript_quote": "Let me check where the child visibility changes during drag before changing the handler.",
        "observation": "The candidate identified event sequencing as the likely source of the bug.",
        "comparison": "A strong candidate would continue by confirming the exact state before and after the first drag movement."
      }
    ],
    "signals": [
      {
        "key": "runtime_flow_and_event_sequencing",
        "label": "Runtime Flow And Event Sequencing",
        "status": "present",
        "score": 75,
        "evidence_quotes": [
          "Let me check where the child visibility changes during drag before changing the handler."
        ],
        "explanation": "They reasoned about the sequence of runtime events instead of editing randomly."
      },
      {
        "key": "direct_code_inspection",
        "label": "Direct Code Inspection",
        "status": "present",
        "score": 70,
        "evidence_quotes": [
          "Opening the drag component and state reducer first."
        ],
        "explanation": "They used the codebase as source of truth before forming a fix."
      }
    ]
  }
}
```

## Evidence Rules

Every score must be grounded in transcript evidence.

Required for every dimension:

- `score`
- `narrative`
- `evidence`
- `expected_standard`
- `observed_points`

Recommended for the concrete-signal upgrade:

- `signals`

Evidence requirements:

- Use exact or near-verbatim transcript quotes.
- Prefer candidate actions over AI claims.
- Distinguish candidate-authored reasoning from AI-generated reasoning.
- Mark a signal `absent` only when the transcript contains enough context to
  know the behavior should have appeared.
- Mark a signal `not_applicable` when the challenge did not create a fair
  opportunity to demonstrate it.
- Do not penalize missing optimization or subagent delegation unless the task or
  environment made them relevant.

## AI Interviewer Handling

AI Interviewer dialogue is stored in `interactions` as:

- `interview_question`
- `interview_response`

The transcript parser appends these under `LIVE INTERVIEWER DIALOGUE`. This
dialogue should be treated as first-class evidence, not secondary commentary.

Positive interviewer-dialogue signals:

- candidate asks clarifying questions tied to constraints or expected behavior,
- candidate explains trade-offs clearly,
- candidate challenges assumptions in the interviewer question,
- candidate connects their implementation choice to the problem domain,
- candidate admits uncertainty and proposes a verification path.

Negative interviewer-dialogue signals:

- vague answers that do not address the question,
- confident but unsupported claims,
- inability to explain code they just accepted from AI,
- off-topic questions about scoring or process instead of engineering trade-offs.

Important distinction:

- AI Interviewer questions are not candidate evidence by themselves.
- Candidate replies to those questions are evidence.
- Candidate questions to the interviewer are evidence.

## UI Requirements

The radar chart may remain as a compact overview, but it should not be the only
view of skill dimensions.

The report UI should show:

- the numeric dimension score,
- top observed concrete signals,
- absent or weak concrete signals,
- `expected_standard`,
- transcript-grounded `observed_points`,
- quote verification status when available.

Suggested dimension card layout:

```txt
Debugging Approach: 72/100

Observed signals
- Runtime Flow And Event Sequencing: present
- Direct Code Inspection: present
- AI Grilling: weak

Evidence
"Let me check where the child visibility changes during drag..."

Expected
Reproduce the issue, trace state transitions, isolate root cause, apply a focused
fix, and verify adjacent flows.
```

## Prompt Requirements

The analysis prompt should instruct the model to:

1. preserve the existing eight dimensions,
2. evaluate concrete behavioral signals under each dimension,
3. cite transcript quotes for every positive or negative signal,
4. distinguish AI-generated suggestions from candidate judgment,
5. treat absent signals carefully,
6. use AI Interviewer dialogue only when it reflects candidate reasoning,
7. return `signals` as optional structured data inside each dimension.

The prompt should not ask the model to infer personality traits. It should score
observable behavior only.

## Backward Compatibility

This can be introduced without changing the database schema because
`dimension_details` is JSONB.

Existing analyses without `signals` remain valid:

- UI should show existing `narrative`, `expected_standard`, and
  `observed_points`.
- If `signals` is missing, the UI can display "Concrete signal breakdown not
  available for this analysis."
- The existing enrichment endpoint can be extended later to backfill `signals`.

Public API compatibility:

- Existing fields remain unchanged.
- `dimension_details.*.signals` may appear as an additive field.
- API consumers should be told the field is optional.

## Implementation Plan

### Phase 1: Prompt-only upgrade

- Update `DIMENSION_RUBRICS` to include the concrete behavioral signals.
- Update the analyzer JSON schema to allow `signals` under each dimension.
- Keep numeric scores and existing fields unchanged.
- Add tests with transcript fixtures that prove the analyzer can cite concrete
  signal evidence.

### Phase 2: Evidence verification

- Extend evidence verification to check:
  - `signals[].evidence_quotes`,
  - existing `observed_points[].transcript_quote`,
  - existing `evidence[]`.
- Mark unverified signal quotes with verification metadata instead of silently
  trusting them.

### Phase 3: UI upgrade

- Update `DimensionEvidenceModal` to show a "Signals" tab.
- Show signal status, short explanation, and quotes.
- Keep the current Summary, Standard, and Evidence views.
- Consider replacing the radar chart headline with a more evidence-first
  "Skill Evidence" section while retaining the radar as secondary context.

### Phase 4: Backfill and enrichment

- Extend `/enrich-dimensions` to generate missing `signals`.
- Make enrichment idempotent.
- Avoid rewriting existing score numbers unless a full re-analysis is requested.

### Phase 5: Product calibration

- Review real candidate reports with human evaluators.
- Check whether signals correlate with hiring judgment.
- Adjust signal labels, status thresholds, and dimension mapping without
  changing public dimension keys.

## Open Questions

- Should signal scores be numeric, categorical, or both?
- Should signal weights differ by challenge type, seniority, or company role?
- Should `creativity` remain a public dimension, or eventually be renamed to
  something more AI-native like `solution_exploration`?
- Should `efficiency` include time-based telemetry, or only transcript behavior?
- Should interviewer dialogue be weighted lower than observed terminal/code
  behavior, or treated equally when the reply is substantive?

## Recommended Next Step

Implement this as an additive `signals` field inside `dimension_details`, then
update the UI to expose those signals before changing any public dimension names
or database columns.
