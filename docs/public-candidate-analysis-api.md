# Public Candidate Analysis API

Use this endpoint to fetch every assessment attempt and analysis result associated with a candidate email address.

The endpoint is public-facing for external integrations, but it requires an API key because the response contains candidate evaluation data.

## Endpoint

```http
GET /api/public/candidate-analysis?email=candidate@example.com
Authorization: Bearer <CANDIDATE_ANALYSIS_API_KEY>
```

You may also pass the key with `x-api-key`:

```http
GET /api/public/candidate-analysis?email=candidate@example.com
x-api-key: <CANDIDATE_ANALYSIS_API_KEY>
```

## Query Parameters

| Parameter | Required | Description |
|---|---:|---|
| `email` | Yes | Candidate email address. Matching is case-insensitive. |

## Response Shape

```ts
type PublicCandidateAnalysisResponse = {
  candidate: {
    email: string;
    name: string | null;
  };
  total_attempts: number;
  analyses: PublicCandidateAnalysis[];
};

type PublicCandidateAnalysis = {
  session: {
    id: string;
    status: 'pending' | 'active' | 'completed' | 'queued' | 'analyzing' | 'analyzed';
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
  };
  challenge: {
    id: string;
    title: string;
    description: string;
    role: string | null;
    tech_stack: string | null;
    seniority: string | null;
    focus_areas: string | null;
    context: string | null;
    time_limit_min: number;
  };
  analysis: {
    id: string;
    created_at: string;
    overall_score: number;
    hiring_recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';
    scores: {
      problem_decomposition: number;
      first_principles: number;
      creativity: number;
      iteration_quality: number;
      debugging_approach: number;
      architecture_thinking: number;
      communication_clarity: number;
      efficiency: number;
    };
    dimension_details: Record<string, DimensionDetail>;
    summary_narrative: string;
    transcript_narrative: string | null;
    strengths: string[];
    areas_for_growth: string[];
    key_moments: KeyMoment[];
    timeline_data: TimelineEntry[];
    prompt_complexity: PromptComplexityEntry[];
    category_breakdown: Record<string, number>;
  } | null;
};

type DimensionDetail = {
  score: number;
  narrative: string;
  evidence: string[];
  observed_points?: ObservedPoint[];
  expected_standard?: string;
};

type ObservedPoint = {
  transcript_quote: string;
  observation: string;
  comparison: string;
};

type KeyMoment = {
  timestamp: string;
  type: 'strength' | 'weakness' | 'pivot' | 'insight';
  title: string;
  description: string;
  interaction_index?: number;
};

type TimelineEntry = {
  start_time: number;
  end_time: number;
  activity: string;
  category: 'planning' | 'coding' | 'debugging' | 'prompting' | 'reviewing';
};

type PromptComplexityEntry = {
  sequence: number;
  complexity: number;
  label: string;
};
```

`analysis` is `null` when a matching session exists but no analysis result has been generated yet.

## Field Reference

### Top Level

| Field | Type | Description |
|---|---|---|
| `candidate` | object | Candidate identity for the requested email. |
| `candidate.email` | string | Normalized lowercase email from the request query. |
| `candidate.name` | string \| null | Candidate name from the latest matching session that has a non-empty name. `null` when no matching session exists. |
| `total_attempts` | number | Count of matching sessions for the candidate email. |
| `analyses` | array | One item per matching session, ordered newest first by `session.created_at`. |

### `analyses[]`

| Field | Type | Description |
|---|---|---|
| `session` | object | Session metadata for one candidate attempt. |
| `challenge` | object | Challenge metadata for that attempt. |
| `analysis` | object \| null | Analysis report for the session. `null` when the session has no row in `analysis_results`. |

### `session`

| Field | Type | Description |
|---|---|---|
| `id` | string | Session UUID. |
| `status` | string | Current session state. One of `pending`, `active`, `completed`, `queued`, `analyzing`, `analyzed`. |
| `started_at` | string \| null | ISO timestamp for when the candidate started. |
| `ended_at` | string \| null | ISO timestamp for when the candidate finished. This is the completion date shown in the report UI. |
| `created_at` | string | ISO timestamp for when the session was created. |

### `challenge`

| Field | Type | Description |
|---|---|---|
| `id` | string | Challenge UUID. |
| `title` | string | Challenge title. |
| `description` | string | Full challenge description. |
| `role` | string \| null | Target role for evaluation, for example `full-stack`. |
| `tech_stack` | string \| null | Expected or relevant stack, for example `React`. |
| `seniority` | string \| null | Seniority level used to calibrate scoring, for example `mid`. |
| `focus_areas` | string \| null | Assessment focus areas, for example `debugging`. |
| `context` | string \| null | Additional evaluator context supplied with the challenge. |
| `time_limit_min` | number | Time limit in minutes. |

### `analysis`

| Field | Type | Description |
|---|---|---|
| `id` | string | Analysis UUID. |
| `created_at` | string | ISO timestamp for when the analysis was generated. |
| `overall_score` | number | Overall score used in the report header. |
| `hiring_recommendation` | string | Recommendation badge value. One of `strong_yes`, `yes`, `neutral`, `no`, `strong_no`. Consumers can display these as `Strong Yes`, `Yes`, `Neutral`, `No`, and `Strong No`. |
| `scores` | object | Flat numeric score map for each scoring dimension. |
| `scores.problem_decomposition` | number | Problem decomposition score. |
| `scores.first_principles` | number | First-principles thinking score. |
| `scores.creativity` | number | Creativity score. |
| `scores.iteration_quality` | number | Iteration quality score. |
| `scores.debugging_approach` | number | Debugging approach score. |
| `scores.architecture_thinking` | number | Architecture thinking score. |
| `scores.communication_clarity` | number | Communication clarity score. |
| `scores.efficiency` | number | Efficiency score. |
| `dimension_details` | object | Detailed per-dimension narratives, expected standards, and evidence. Keys match scoring dimensions such as `problem_decomposition`. |
| `summary_narrative` | string | Main report summary paragraph shown near the top of the UI. |
| `transcript_narrative` | string \| null | Human-readable narrative of the candidate session, when generated. |
| `strengths` | string[] | Bullet list of candidate strengths. |
| `areas_for_growth` | string[] | Bullet list of areas for improvement. |
| `key_moments` | array | Highlighted moments from the session. |
| `timeline_data` | array | Timeline chart/activity segments. |
| `prompt_complexity` | array | Prompt complexity chart entries. |
| `category_breakdown` | object | Activity category distribution, keyed by category name. |

### `dimension_details`

`dimension_details` is an object keyed by dimension name. Expected keys are:

- `problem_decomposition`
- `first_principles`
- `creativity`
- `iteration_quality`
- `debugging_approach`
- `architecture_thinking`
- `communication_clarity`
- `efficiency`

Each dimension value has this shape:

| Field | Type | Description |
|---|---|---|
| `score` | number | Score for that dimension. This should match the corresponding value in `analysis.scores`. |
| `narrative` | string | Dimension-specific written assessment. This is the body text in the dimension detail modal. |
| `evidence` | string[] | Legacy/simple evidence bullets for the dimension. |
| `expected_standard` | string \| undefined | Description of what a strong candidate should have done for this role, stack, seniority, and challenge. This powers the `Expected Standard` panel in the UI. |
| `observed_points` | array \| undefined | Detailed evidence breakdown comparing observed candidate behavior to expectations. |

Older analyses may not have `expected_standard` or `observed_points`. New or enriched analyses should include them.

### `observed_points[]`

| Field | Type | Description |
|---|---|---|
| `transcript_quote` | string | Exact or near-verbatim candidate text/action from the transcript. This is the observed quote shown in the evidence breakdown. |
| `observation` | string | Explanation of what the observed action reveals about the candidate. |
| `comparison` | string | Comparison against expected behavior for a strong candidate. This is the expected-side text in the evidence breakdown. |

### `key_moments[]`

| Field | Type | Description |
|---|---|---|
| `timestamp` | string | Moment timestamp or time marker. |
| `type` | string | One of `strength`, `weakness`, `pivot`, `insight`. |
| `title` | string | Short title for the moment. |
| `description` | string | Explanation of the moment. |
| `interaction_index` | number \| undefined | Optional transcript interaction index for jumping to the related event. |

### `timeline_data[]`

| Field | Type | Description |
|---|---|---|
| `start_time` | number | Segment start time in minutes or relative time units used by the report chart. |
| `end_time` | number | Segment end time in the same units as `start_time`. |
| `activity` | string | Label describing what the candidate was doing. |
| `category` | string | One of `planning`, `coding`, `debugging`, `prompting`, `reviewing`. |

### `prompt_complexity[]`

| Field | Type | Description |
|---|---|---|
| `sequence` | number | Prompt or interaction sequence number. |
| `complexity` | number | Numeric complexity score for that prompt. |
| `label` | string | Human-readable prompt label. |

### `category_breakdown`

`category_breakdown` is a map of activity category to numeric share/count, for example:

```json
{
  "planning": 15,
  "coding": 45,
  "debugging": 25,
  "prompting": 15
}
```

## Example

```bash
curl "https://hire.vizuara.ai/api/public/candidate-analysis?email=vikash3@gmail.com" \
  -H "Authorization: Bearer $CANDIDATE_ANALYSIS_API_KEY"
```

```json
{
  "candidate": {
    "email": "vikash3@gmail.com",
    "name": "Vikash Chandra Mishra"
  },
  "total_attempts": 1,
  "analyses": [
    {
      "session": {
        "id": "session_uuid",
        "status": "analyzed",
        "started_at": "2026-04-28T10:00:00.000Z",
        "ended_at": "2026-04-28T10:10:00.000Z",
        "created_at": "2026-04-28T09:58:00.000Z"
      },
      "challenge": {
        "id": "challenge_uuid",
        "title": "E-commerce Product Filter Refactor & Optimization",
        "description": "Refactor and optimize a React-based product filtering experience.",
        "role": "full-stack",
        "tech_stack": "React",
        "seniority": "mid",
        "focus_areas": "debugging",
        "context": null,
        "time_limit_min": 10
      },
      "analysis": {
        "id": "analysis_uuid",
        "created_at": "2026-04-28T10:12:00.000Z",
        "overall_score": 1,
        "hiring_recommendation": "strong_no",
        "scores": {
          "problem_decomposition": 5,
          "first_principles": 0,
          "creativity": 0,
          "iteration_quality": 0,
          "debugging_approach": 0,
          "architecture_thinking": 0,
          "communication_clarity": 2,
          "efficiency": 0
        },
        "dimension_details": {
          "problem_decomposition": {
            "score": 5,
            "narrative": "The candidate made no attempt to decompose the given problem. Their only action was to request a simple HTML file, which is entirely unrelated to the React refactoring and optimization challenge.",
            "evidence": [
              "The candidate's only recorded action was unrelated to the assigned React challenge."
            ],
            "expected_standard": "A strong mid-level React candidate would start by clearly outlining a plan to address the multiple requirements: bug fixing, debouncing, performance optimization, and URL state persistence.",
            "observed_points": [
              {
                "transcript_quote": "Ok. Create simple html fiel Dilly-dallying...",
                "observation": "The candidate's only action was to ask for a simple HTML file, completely ignoring the complex React refactoring problem presented.",
                "comparison": "A strong mid-level React candidate would begin by reading the requirements, identifying the core bugs and features, and outlining a plan to tackle them sequentially or in parallel."
              }
            ]
          },
          "debugging_approach": {
            "score": 0,
            "narrative": "No debugging approach was demonstrated because the candidate did not engage with the provided application or its defects.",
            "evidence": [],
            "expected_standard": "A strong candidate would reproduce the reported issue, inspect the relevant components or state flow, and verify fixes with targeted checks.",
            "observed_points": []
          }
        },
        "summary_narrative": "The candidate demonstrated virtually no engagement with the provided challenge. Their only recorded action was a single off-topic prompt, making it impossible to evaluate most core dimensions.",
        "transcript_narrative": "The candidate opened the session and entered one unrelated prompt asking for a simple HTML file. They did not inspect the React codebase, run tests, debug the issue, or modify the challenge files.",
        "strengths": [],
        "areas_for_growth": [
          "Engaging with the problem statement and understanding the requirements.",
          "Formulating relevant and clear prompts for the AI assistant.",
          "Breaking down complex problems into manageable sub-tasks.",
          "Applying fundamental programming and framework concepts to solve problems.",
          "Iterating on solutions and debugging effectively."
        ],
        "key_moments": [
          {
            "timestamp": "00:01",
            "type": "weakness",
            "title": "Off-topic prompt",
            "description": "The candidate asked for a simple HTML file instead of engaging with the React refactor challenge.",
            "interaction_index": 1
          }
        ],
        "timeline_data": [
          {
            "start_time": 0,
            "end_time": 10,
            "activity": "Unrelated prompt with no challenge progress",
            "category": "prompting"
          }
        ],
        "prompt_complexity": [
          {
            "sequence": 1,
            "complexity": 1,
            "label": "Simple unrelated generation request"
          }
        ],
        "category_breakdown": {
          "prompting": 100
        }
      }
    }
  ]
}
```

## Empty Result Example

If the API key is valid but no sessions match the email, the endpoint returns `200` with an empty `analyses` array:

```json
{
  "candidate": {
    "email": "unknown@example.com",
    "name": null
  },
  "total_attempts": 0,
  "analyses": []
}
```

## Session Without Analysis Example

If a candidate has a session but analysis has not been generated yet, that attempt is still returned:

```json
{
  "candidate": {
    "email": "vikash3@gmail.com",
    "name": "Vikash Chandra Mishra"
  },
  "total_attempts": 1,
  "analyses": [
    {
      "session": {
        "id": "session_uuid",
        "status": "completed",
        "started_at": "2026-04-28T10:00:00.000Z",
        "ended_at": "2026-04-28T10:10:00.000Z",
        "created_at": "2026-04-28T09:58:00.000Z"
      },
      "challenge": {
        "id": "challenge_uuid",
        "title": "E-commerce Product Filter Refactor & Optimization",
        "description": "Refactor and optimize a React-based product filtering experience.",
        "role": "full-stack",
        "tech_stack": "React",
        "seniority": "mid",
        "focus_areas": "debugging",
        "context": null,
        "time_limit_min": 10
      },
      "analysis": null
    }
  ]
}
```

## Status Codes

| Status | Meaning |
|---:|---|
| `200` | Request succeeded. `analyses` may be empty. |
| `400` | Missing or invalid `email` parameter. |
| `401` | Missing or invalid API key. |
| `503` | `CANDIDATE_ANALYSIS_API_KEY` is not configured on the server. |
| `500` | Unexpected server error. |

## Error Response Shape

Non-`200` responses return a JSON object with one field:

```ts
type ErrorResponse = {
  error: string;
};
```

Examples:

```json
{ "error": "Unauthorized" }
```

```json
{ "error": "A valid email query parameter is required" }
```

```json
{ "error": "Candidate analysis API key is not configured" }
```

```json
{ "error": "Internal server error" }
```

## Omitted Internal Fields

The endpoint deliberately does not return internal or sensitive fields such as:

- `sessions.token`
- `challenges.company_id`
- `analysis_results.raw_claude_response`
- `analysis_results.model_used`
- company authentication fields
- raw transcript interactions
- workspace files

## Environment Variable

Set this in production:

```env
CANDIDATE_ANALYSIS_API_KEY=replace-with-a-long-random-secret
```

The key is server-only and should never be exposed as a `NEXT_PUBLIC_*` variable.
