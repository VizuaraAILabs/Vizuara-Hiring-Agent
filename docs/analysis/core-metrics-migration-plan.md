# Core Metrics Migration Plan

## Goal

Replace the current broad analysis dimensions with the sharper metrics in
`docs/CORE_ANALYSIS_METRICS.md` for future reports, while keeping all previous
reports readable and unchanged.

The migration should be versioned, additive first, and reversible enough that
existing recruiter workflows, CSV exports, public APIs, and report shares keep
working during the transition.

## Current State

The analysis system currently uses eight fixed dimensions:

- `problem_decomposition`
- `first_principles`
- `creativity`
- `iteration_quality`
- `debugging_approach`
- `architecture_thinking`
- `communication_clarity`
- `efficiency`

These dimensions are stored in two forms:

- Fixed score columns on `analysis_results`
- Full dimension details in `analysis_results.dimension_details`

Several frontend and API surfaces assume these exact eight fields exist. That
means the old dimensions should not be renamed, removed, or rewritten in place.

## Target State

Historical reports continue to render with the legacy eight dimensions.

New reports render with the CORE metrics from `docs/CORE_ANALYSIS_METRICS.md`.

Reports become schema-aware:

```text
legacy_v1 reports -> show the original 8 dimensions
core_v1 reports   -> show the new CORE metrics
```

Compatibility fields remain available until every consumer has moved to the
new metric model.

## Migration Strategy

### 1. Add Metric Schema Versioning

Add a schema version field to analysis results:

```sql
ALTER TABLE analysis_results
ADD COLUMN IF NOT EXISTS metric_schema_version TEXT NOT NULL DEFAULT 'legacy_v1';
```

Existing reports should implicitly or explicitly be treated as `legacy_v1`.

New reports generated after the migration can use `core_v1`.

### 2. Add Flexible Storage For New Metrics

Add a JSONB field for the new metric set:

```sql
ALTER TABLE analysis_results
ADD COLUMN IF NOT EXISTS analysis_metrics JSONB NOT NULL DEFAULT '{}'::jsonb;
```

This keeps the new metrics independent from the old fixed score columns.

The shape should be similar to the existing dimension details:

```json
{
  "direct_code_inspection": {
    "score": 82,
    "narrative": "...",
    "evidence": [],
    "observed_points": [],
    "expected_standard": "..."
  }
}
```

### 3. Introduce A Metric Registry

Create a single source of truth for metric metadata.

Each metric should have:

- `key`
- `label`
- `description`
- `schema_version`
- `active`
- optional `legacy_column`
- optional `group`

This avoids hard-coding metric lists across prompts, scoring, persistence, and
UI components.

### 4. Keep Legacy Dimensions Stable

Do not delete or rename the old score columns.

For `core_v1` reports, either:

- keep legacy columns populated through a compatibility mapping, or
- keep them as neutral compatibility values while the UI reads from
  `analysis_metrics`

The safer first version is to continue populating the legacy columns so current
CSV exports, dashboard tables, and public APIs do not break.

### 5. Update The Analyzer To Produce Both Shapes

During the transition, analyzer output should contain both:

```json
{
  "dimensions": {
    "problem_decomposition": {},
    "first_principles": {},
    "creativity": {},
    "iteration_quality": {},
    "debugging_approach": {},
    "architecture_thinking": {},
    "communication_clarity": {},
    "efficiency": {}
  },
  "analysis_metrics": {
    "direct_code_inspection": {},
    "ai_grilling": {},
    "calibrated_ai_trust": {}
  },
  "metric_schema_version": "core_v1"
}
```

The legacy dimensions can later become derived summary dimensions instead of
primary model outputs.

### 6. Make Report UI Schema-Aware

Report components should choose the metric display based on
`metric_schema_version`.

- `legacy_v1`: show the current score breakdown and radar chart.
- `core_v1`: show CORE metrics from `analysis_metrics`.

Do not force old reports into the new UI shape unless a deliberate backfill is
planned and validated.

### 7. Move Public APIs And CSVs Gradually

Keep current public API and CSV fields unchanged initially.

Later, add new optional fields:

```json
{
  "metric_schema_version": "core_v1",
  "scores": {
    "problem_decomposition": 72
  },
  "analysis_metrics": {
    "direct_code_inspection": {
      "score": 84
    }
  }
}
```

This lets consumers opt into the new schema without breaking existing
integrations.

## Suggested Rollout Order

### Phase 1: Storage And Registry

- Add `metric_schema_version`.
- Add `analysis_metrics`.
- Add metric registry.
- Keep all current behavior unchanged.

### Phase 2: First CORE Metric

Start with `direct_code_inspection`.

Reason: it is concrete, transcript-observable, and strongly connected to the
desired assessment philosophy.

Implementation scope:

- Add the metric to the analyzer schema.
- Persist it in `analysis_metrics`.
- Add tests proving legacy dimensions are still present.
- Add a small UI section for CORE metrics when present.

### Phase 3: Add More CORE Metrics

Recommended order:

1. `direct_code_inspection`
2. `ai_grilling`
3. `calibrated_ai_trust`
4. `code_comprehension_questions`
5. `change_impact_awareness`
6. `runtime_flow_and_event_sequencing`
7. `codebase_mental_mapping`
8. `problem_and_domain_understanding`
9. `care_about_clean_code`
10. `care_about_simple_code`
11. `care_about_optimization`
12. `subagent_research_delegation`

`subagent_research_delegation` should probably be added late because it depends
on whether the assessment environment actually supports visible subagent use.

### Phase 4: Make CORE Metrics The Default

Once the new metrics are stable:

- Generate new reports as `core_v1`.
- Render CORE metrics as the primary report score breakdown.
- Continue preserving legacy fields for compatibility.

### Phase 5: Deprecate Legacy Surfaces

Only after API consumers, exports, dashboards, and shared report pages support
the new schema:

- Stop treating legacy dimensions as the primary report model.
- Keep old reports readable.
- Avoid rewriting historical reports unless there is a clear product reason.

## Compatibility Rules

- Never mutate historical report scores in place.
- Never remove legacy score columns during the migration.
- New UI must handle both missing `analysis_metrics` and missing
  `metric_schema_version`.
- Public API changes must be additive.
- CSV changes should either be additive or placed behind a new export format.
- Overall score calculation should remain stable until the product explicitly
  chooses how CORE metrics affect the headline score.

## Open Decisions

- Should `overall_score` be computed from CORE metrics, legacy dimensions, or a
  weighted combination during `core_v1`?
- Should legacy dimensions be model-generated or derived from CORE metrics once
  CORE metrics are primary?
- Should all CORE metrics have equal weight?
- Should some CORE metrics be optional depending on challenge type?
- How should reports display absent evidence: zero score, neutral score, or
  explicit "not observed"?

## Initial Recommendation

Do not directly replace the current eight dimensions in one step.

Make CORE metrics the default for future reports through a versioned schema, but
keep old reports on `legacy_v1` and preserve compatibility fields until the rest
of the product has been migrated.
