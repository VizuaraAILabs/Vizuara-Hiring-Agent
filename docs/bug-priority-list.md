# Bug Priority List

Living bug tracker for backend, analysis, timeout handling, and UI/UX issues.

This first iteration covers bugs found by scanning the analysis engine and the web API routes that call it. Priorities use:

- `P0`: can hang, lose work, block production workflows, or create misleading hiring output at scale.
- `P1`: materially wrong behavior or unreliable analysis, but with a workaround or narrower blast radius.
- `P2`: degraded UX, observability, maintainability, or accuracy issues that should be fixed after P0/P1.
- `P3`: cleanup and low-risk polish.

## P0

### AE-P0-001: Gemini calls have no hard timeout or cancellation boundary

- Status: Fixed
- Area: Analysis engine / timeout handling
- Original evidence: `ClaudeAnalyzer._generate_content_with_key_fallback()` called `models.generate_content()` directly with no deadline. The async router wrapped analysis calls in `asyncio.to_thread()` without `asyncio.wait_for()`.
- Original impact: A slow or stuck Gemini request could occupy an analysis worker forever. Because the queue is bounded only by worker count, enough stuck calls could halt all future analysis jobs.
- Resolution: Added a configurable Gemini SDK request timeout (`GEMINI_REQUEST_TIMEOUT_MS`, default 60s) through `types.HttpOptions`, plus operation-level deadlines for full analysis, dimension enrichment, and transcript narrative generation. Timeout failures now raise `AnalysisTimeoutError`, direct routes return `504`, and background jobs persist `analysis_timeout` diagnostics in `analysis_failures` before moving sessions to `analysis failed`.

### AE-P0-002: Web routes calling the analysis engine have no request timeout

- Status: Fixed
- Area: Web API / timeout handling
- Original evidence: The analysis trigger, dimension enrichment, and transcript narrative routes called `fetch()` without `AbortController`.
- Original impact: Requests could hang until platform/runtime defaults kicked in. Users got no deterministic failure, and serverless/Node resources remained tied up.
- Resolution: Added explicit `AbortController` timeouts to the analysis trigger, dimension enrichment, and transcript narrative routes. Timeout paths now return deterministic `504` responses and record backend-only failure rows where appropriate.

### AE-P0-003: Failed background analysis resets sessions to `completed`, losing the failure reason

- Status: Fixed
- Area: Analysis status lifecycle
- Original evidence: `_run_analysis_in_background()` caught every exception and moved queued/analyzing sessions back to `completed`.
- Original impact: A failed analysis became indistinguishable from a never-analyzed completed session. Users could repeatedly retry without seeing the root cause, and operators could not query failed jobs.
- Resolution: Added explicit `analysis failed` session status and backend-only `analysis_failures` diagnostics (`database/migrations/023_analysis_failed_status.sql`). Background analysis failures now record an error code/message/metadata and leave the session in `analysis failed`; retry paths accept that status.

### AE-P0-004: Queue state is process-local and not safe across multiple engine instances

- Status: Fixed
- Area: Analysis queue / deployment scaling
- Original evidence: `_analysis_queue`, `_queued_session_ids`, and `_analysis_workers` were in-memory globals, and deduplication only happened against a process-local set.
- Original impact: Multiple analysis-engine processes could enqueue/process the same session concurrently. The database unique constraint on `analysis_results.session_id` prevented duplicate final rows, but the loser could still waste Gemini calls and then reset session state through the generic failure path.
- Resolution: Added a Postgres-backed `analysis_jobs` queue keyed by `session_id`, with worker ownership, leases, attempts, and failure metadata (`database/migrations/025_analysis_jobs.sql`). Analysis workers now claim jobs atomically with `FOR UPDATE SKIP LOCKED`, extend leases with a heartbeat while analysis runs, and use the database as the shared queue across engine instances.

### TERM-P0-001: Live terminal/container session state is process-local

- Status: Fixed
- Area: Terminal server / production reliability
- Original evidence: `DockerManager` stored live `DockerSession` objects only in an in-memory `sessions` map. On reconnect, the WebSocket handler only reattached if `dockerManager.getSession(sessionId)` found that in-memory entry.
- Original impact: Restarting or redeploying the terminal server lost live session attachments even when Docker containers kept running. Candidates could be interrupted, reconnects could fail or replace orphaned containers, horizontal scaling required sticky routing, and cleanup depended on best-effort sweeps.
- Resolution: Added a Postgres-backed `terminal_runtime_sessions` registry with `container_id`, `host_work_dir`, `assigned_terminal_server_id`, runtime status, heartbeat, and lease expiry (`database/migrations/026_terminal_runtime_sessions.sql`). The terminal server now records runtime ownership after spawning, heartbeats while active, preserves containers during graceful shutdown, and can recover same-host live containers from Postgres on reconnect instead of replacing them.

## P1

### AE-P1-001: Recovery re-enqueues all queued/analyzing sessions without stale-job checks

- Status: Fixed
- Area: Analysis queue recovery
- Original evidence: `_recover_pending_analysis_sessions()` selected every session in `queued` or `analyzing` with no analysis row.
- Original impact: On restart, a genuinely active job in another process could be duplicated. Old stuck sessions were retried forever with no attempt cap or backoff.
- Resolution: Analysis recovery now creates or updates durable `analysis_jobs` rows and worker claiming is guarded by Postgres leases, ownership, heartbeat expiry, `attempt_count`, and `last_error`. Active jobs in other processes are not reclaimed until their lease expires.

### AE-P1-002: Direct `/analyze` and queued `/analyze/start` paths have inconsistent allowed statuses

- Status: Fixed
- Area: API contract
- Original evidence: `/analyze/start` accepted `completed` and `active` sessions inside the engine, while the web API only allowed completed sessions. Direct `/analyze` also accepted `active`.
- Original impact: Behavior depended on which caller was used. Active sessions could be analyzed through engine endpoints but not through the web route, risking partial transcripts and confusing status behavior.
- Resolution: Standardized production analysis start states to `completed` and `analysis failed` only. `queued`/`analyzing` remain idempotent states for `/analyze/start`, but `active` sessions are rejected by both direct and queued engine paths.

### AE-P1-003: Transcript parser contains mojibake patterns that likely do not match real terminal glyphs

- Status: Open
- Area: Transcript parsing / analysis accuracy
- Evidence: The parser comments and regexes include mojibake/corrupted representations of box-drawing, prompt-marker, spinner, and separator glyphs in TUI stripping/detection (`services/analysis-engine/src/services/transcript_parser.py:33`, `services/analysis-engine/src/services/transcript_parser.py:127`, `services/analysis-engine/src/services/transcript_parser.py:140`).
- Impact: If actual stored terminal output contains proper Unicode glyphs, TUI detection and cleanup will miss them. If stored output is mojibake, the code is accidentally coupled to that corruption. Either way, parsing is fragile and analysis can be based on noisy or missing transcript turns.
- Suggested fix: Add fixture-based parser tests with raw stored interactions, normalize encoding once, and make regexes target the real stored representation deliberately.

### AE-P1-004: TUI extraction can drop short but meaningful candidate actions

- Status: Fixed
- Area: Transcript parsing / candidate evidence
- Original evidence: `_extract_tui_conversation()` ignored prompt-marker text under 30 chars and input prompt records under 40 chars. `_clean_tui_text()` also stripped isolated single letters.
- Original impact: Commands like `ls`, `pwd`, `npm test`, `git diff`, `pytest`, or short diagnostic prompts could disappear from the transcript. This directly affected scoring for debugging, iteration, and efficiency.
- Resolution: TUI extraction now classifies likely candidate commands before applying generic length thresholds, preserving short shell/tool actions while still dropping short noise. Parser tests cover short command preservation and short-noise rejection.

### AE-P1-005: Quality gate assesses raw interactions instead of parsed candidate turns

- Status: Fixed
- Area: Quality gate / scoring reliability
- Original evidence: `TranscriptQualityGate.assess()` counted raw `direction == "input"` records even though the parser may reconstruct, collapse, drop, or append interview turns before analysis.
- Original impact: A noisy raw session could pass the quality gate even if parsed candidate content was empty or badly truncated. Conversely, meaningful reconstructed TUI prompts could fail if raw input records were sparse.
- Resolution: `TranscriptParser` now exposes `parse_with_turns()`, returning the final transcript plus the cleaned parsed turns used to build it. The main analysis path passes those turns into `TranscriptQualityGate`, which now counts parsed candidate turns instead of raw database rows.

### AE-P1-006: Transcript truncation can exceed the configured max length when candidate content alone is large

- Status: Open
- Area: Transcript sizing / model reliability
- Evidence: `_truncate_ai_responses()` subtracts candidate length from `_MAX_TRANSCRIPT_LENGTH`, but if candidate content already exceeds the limit, `remaining` becomes negative and the method still keeps all candidate content (`services/analysis-engine/src/services/transcript_parser.py:385`, `services/analysis-engine/src/services/transcript_parser.py:403`).
- Impact: Large candidate prompts or pasted code can push requests beyond intended model/token budgets, increasing latency, cost, and failure risk.
- Suggested fix: Enforce a true global budget with role-aware truncation/summarization and explicit notation for omitted content.

### AE-P1-007: Evidence verification can mark fabricated citations as verified by segment reference alone

- Status: Fixed
- Area: Evidence verification / hiring output accuracy
- Original evidence: `_fuzzy_match()` returned verified if an evidence item included any existing `#N` segment reference. It also used a low global similarity threshold of `0.4`.
- Original impact: A model could cite a real segment number while fabricating the claim, and the verifier would still bless it. This undermined the anti-hallucination guardrail.
- Resolution: Evidence verification now extracts numbered transcript segments and requires cited claims or quoted text to match the referenced segment body. Bare segment references are insufficient, and the general fuzzy threshold was raised from `0.4` to `0.6`.

### AE-P1-008: Evidence verification ignores `observed_points`

- Status: Fixed
- Area: Evidence verification / dimension details
- Original evidence: `EvidenceVerifier.verify()` only iterated `dim_data["evidence"]`. The richer `observed_points[].transcript_quote` fields were generated and saved but not verified.
- Original impact: The UI could display detailed observed points that contain fabricated or inaccurate transcript quotes, even when the simpler evidence list was checked.
- Resolution: `EvidenceVerifier` now checks every `observed_points[].transcript_quote`, annotates each point with `quote_verified` and `quote_similarity`, prefixes unverified quotes with `[UNVERIFIED]`, includes observed-point counts/rates in verification metadata, and runs on both full analysis and post-hoc dimension enrichment before saving.

### AE-P1-009: Missing DB connection timeout and pool cleanup

- Status: Fixed
- Area: Database reliability
- Original evidence: `_get_pool()` created an asyncpg pool with only `min_size` and `max_size`. Shutdown stopped workers but did not close `_pool`.
- Original impact: Startup or query paths could hang on database connectivity issues, and shutdown could leave connections to be cleaned up by process termination.
- Resolution: Added configurable asyncpg connection, command, and close timeouts (`ANALYSIS_DB_CONNECT_TIMEOUT_SECONDS`, default 10s; `ANALYSIS_DB_COMMAND_TIMEOUT_SECONDS`, default 30s; `ANALYSIS_DB_CLOSE_TIMEOUT_SECONDS`, default 10s), passed them through Docker/env docs, and close the analysis DB pool during FastAPI shutdown after queue workers stop. If graceful close times out, the pool is terminated.

## P2

### AE-P2-001: Analysis engine error details are swallowed by web API responses

- Status: Fixed
- Area: Web API / operator UX
- Original evidence: The web route logged the engine body but returned a generic `Analysis engine failed`. Enrichment and narrative routes similarly returned generic failures.
- Original impact: The UI could not distinguish timeout, invalid status, missing analysis, provider failure, or malformed response. Users and support staff lost actionable context.
- Resolution: Added normalized analysis-engine error payloads with safe `code`, `message`, and `retryable` fields, plus structured server-side logging and durable `analysis_failures` rows for diagnostics. Web analysis routes now preserve safe error categories for callers while keeping raw engine responses in backend logs/metadata only.

### AE-P2-002: Cost tracking uses hard-coded Gemini rates instead of configured cost settings

- Status: Fixed
- Area: Cost tracking
- Original evidence: `_analyze_session_impl()` computed cost with literal `$0.15` and `$0.60` per million tokens, while `cost_settings` exists for configurable rates.
- Original impact: Cost reports could drift if pricing or company-specific settings changed.
- Resolution: Gemini analysis cost events now read company `cost_settings.gemini_input_rate` and `gemini_output_rate`, fall back to defaults only when settings are absent, and store the rates/source used in usage metadata. The admin cost-settings UI supports fine-grained token-rate updates.

### AE-P2-003: Canned insufficient-data dimensions omit newer dimension fields

- Status: Fixed
- Area: Schema consistency
- Original evidence: `TranscriptQualityGate` returned dimensions with `score`, `narrative`, and `evidence`, but omitted `observed_points` and `expected_standard`.
- Original impact: Consumers that assume the newer dimension shape could render inconsistent or empty states for quality-gated sessions.
- Resolution: Canned insufficient-data dimensions now include `observed_points: []` and an explanatory `expected_standard`, with test coverage for the richer fallback shape.

### AE-P2-004: Key moment annotation lookup likely confuses model index with interaction sequence number

- Status: Fixed
- Area: Report persistence
- Original evidence: `interaction_index` from model output was used directly as `interactions.sequence_num`. The transcript parser renumbers formatted segments from `1` after collapsing/truncation.
- Original impact: Key moment annotations could attach to the wrong raw interaction or fail to attach at all.
- Resolution: Parsed transcript turns now carry their model-visible `transcript_index` plus source raw sequence numbers. Report persistence resolves key-moment `interaction_index` through that parsed-turn mapping before looking up the raw interaction row, with fallback behavior for older callers.

### AE-P2-005: Health check reports only API-key presence, not dependency readiness

- Status: Fixed
- Area: Operations
- Evidence: `/health` returns `status: healthy` plus `gemini_key_set` only (`services/analysis-engine/src/main.py:80`).
- Impact: Load balancers or monitoring may treat the engine as healthy even when the database is unreachable, workers failed to start, or provider calls are failing.
- Resolution: `/health` is now a liveness-only endpoint, and `/ready` returns `200` or `503` based on database connectivity, queue table access/depth, analysis worker readiness, and Gemini API key configuration.

### WEB-P2-001: Public challenge apply flow cannot identify role-claim admin challenge owners

- Status: Open
- Area: Web API / admin challenge quotas
- Evidence: The candidate apply route determines whether a challenge is admin-created by loading the owner company email and calling `isAdmin(company.email)` without access to the owner's Firebase role claim (`apps/web/src/app/api/challenges/[id]/apply/route.ts:63`).
- Impact: A challenge created by a role-claim admin can be treated as a regular company challenge during candidate application, so plan/trial quota checks may apply instead of the admin challenge `sessions_limit` behavior.
- Suggested fix: Persist admin ownership on the company or challenge at creation time, then have the apply route check that stored ownership flag instead of trying to infer admin status from email.

## P3

### AE-P3-001: Analysis engine naming still says Claude while implementation uses Gemini

- Status: Open
- Area: Maintainability
- Evidence: Service class is `ClaudeAnalyzer`, raw response field is named `raw_claude_response`, and comments mention Claude, while the implementation uses Gemini (`services/analysis-engine/src/services/claude_analyzer.py:206`, `services/analysis-engine/src/services/report_generator.py:56`).
- Impact: Naming increases confusion during debugging and cost analysis.
- Suggested fix: Rename code and DB-facing aliases carefully, or add compatibility comments while migrating.

### AE-P3-002: Root service metadata does not list current background-analysis endpoints

- Status: Open
- Area: API discoverability
- Evidence: `/` lists `POST /analyze` and `GET /health`, but not `/analyze/start`, `/analyze/enrich-dimensions`, or `/analyze/transcript-narrative` (`services/analysis-engine/src/main.py:55`).
- Impact: Developers may discover or test the wrong endpoint.
- Suggested fix: Update endpoint metadata or expose OpenAPI docs as the source of truth.
