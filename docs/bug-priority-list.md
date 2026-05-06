# Bug Priority List

Living bug tracker for backend, analysis, timeout handling, and UI/UX issues.

This first iteration covers bugs found by scanning the analysis engine and the web API routes that call it. Priorities use:

- `P0`: can hang, lose work, block production workflows, or create misleading hiring output at scale.
- `P1`: materially wrong behavior or unreliable analysis, but with a workaround or narrower blast radius.
- `P2`: degraded UX, observability, maintainability, or accuracy issues that should be fixed after P0/P1.
- `P3`: cleanup and low-risk polish.

## P0

### AE-P0-001: Gemini calls have no hard timeout or cancellation boundary

- Status: Open
- Area: Analysis engine / timeout handling
- Evidence: `ClaudeAnalyzer._generate_content_with_key_fallback()` calls `models.generate_content()` directly with no deadline (`services/analysis-engine/src/services/claude_analyzer.py:324`, `services/analysis-engine/src/services/claude_analyzer.py:331`). The async router wraps analysis calls in `asyncio.to_thread()` without `asyncio.wait_for()` (`services/analysis-engine/src/routers/analysis.py:130`, `services/analysis-engine/src/routers/analysis.py:455`).
- Impact: A slow or stuck Gemini request can occupy an analysis worker forever. Because the queue is bounded only by worker count, enough stuck calls can halt all future analysis jobs.
- Suggested fix: Add explicit per-call and per-session deadlines, propagate timeout errors into a failed analysis state, and make stuck background work observable.

### AE-P0-002: Web routes calling the analysis engine have no request timeout

- Status: Open
- Area: Web API / timeout handling
- Evidence: The analysis trigger calls `fetch()` without `AbortController` (`apps/web/src/app/api/analysis/[sessionId]/route.ts:67`). Dimension enrichment and transcript narrative routes do the same (`apps/web/src/app/api/analysis/[sessionId]/enrich-dimensions/route.ts:30`, `apps/web/src/app/api/analysis/[sessionId]/transcript-narrative/route.ts:53`).
- Impact: Requests can hang until platform/runtime defaults kick in. Users get no deterministic failure, and serverless/Node resources remain tied up.
- Suggested fix: Use the same timeout pattern already present in challenge generation routes: `AbortController`, clear the timer, and return a useful timeout response.

### AE-P0-003: Failed background analysis resets sessions to `completed`, losing the failure reason

- Status: Open
- Area: Analysis status lifecycle
- Evidence: `_run_analysis_in_background()` catches every exception and updates queued/analyzing sessions back to `completed` (`services/analysis-engine/src/routers/analysis.py:453`, `services/analysis-engine/src/routers/analysis.py:467`).
- Impact: A failed analysis becomes indistinguishable from a never-analyzed completed session. Users can repeatedly retry without seeing the root cause, and operators cannot query failed jobs.
- Suggested fix: Add an `analysis_failed` or `failed` status plus an error table/column with timestamp, error category, retry count, and last message.

### AE-P0-004: Queue state is process-local and not safe across multiple engine instances

- Status: Open
- Area: Analysis queue / deployment scaling
- Evidence: `_analysis_queue`, `_queued_session_ids`, and `_analysis_workers` are in-memory globals (`services/analysis-engine/src/routers/analysis.py:30`, `services/analysis-engine/src/routers/analysis.py:31`). Deduplication is only against the local set (`services/analysis-engine/src/routers/analysis.py:103`).
- Impact: Multiple analysis-engine processes can enqueue/process the same session concurrently. The database unique constraint on `analysis_results.session_id` prevents duplicate final rows, but the loser may waste Gemini calls and then reset session state through the generic failure path.
- Suggested fix: Move queue leasing into the database or a real queue, using atomic job claims, leases, attempts, and heartbeat/expiry semantics.

## P1

### AE-P1-001: Recovery re-enqueues all queued/analyzing sessions without stale-job checks

- Status: Open
- Area: Analysis queue recovery
- Evidence: `_recover_pending_analysis_sessions()` selects every session in `queued` or `analyzing` with no analysis row (`services/analysis-engine/src/routers/analysis.py:83`, `services/analysis-engine/src/routers/analysis.py:91`).
- Impact: On restart, a genuinely active job in another process can be duplicated. Old stuck sessions are also retried forever with no attempt cap or backoff.
- Suggested fix: Track job ownership, heartbeat, attempt count, and `last_error`; only recover expired jobs.

### AE-P1-002: Direct `/analyze` and queued `/analyze/start` paths have inconsistent allowed statuses

- Status: Open
- Area: API contract
- Evidence: `/analyze/start` accepts `completed` and `active` sessions inside the engine (`services/analysis-engine/src/routers/analysis.py:428`), while the web API only allows `completed` (`apps/web/src/app/api/analysis/[sessionId]/route.ts:62`). Direct `/analyze` accepts `completed` and `active` (`services/analysis-engine/src/routers/analysis.py:483`).
- Impact: Behavior depends on which caller is used. Active sessions can be analyzed through engine endpoints but not through the web route, which risks partial transcripts and confusing status behavior.
- Suggested fix: Decide one contract: completed-only for production analysis, or explicitly support active-session snapshot analysis with clear naming and UI.

### AE-P1-003: Transcript parser contains mojibake patterns that likely do not match real terminal glyphs

- Status: Open
- Area: Transcript parsing / analysis accuracy
- Evidence: The parser comments and regexes include mojibake/corrupted representations of box-drawing, prompt-marker, spinner, and separator glyphs in TUI stripping/detection (`services/analysis-engine/src/services/transcript_parser.py:33`, `services/analysis-engine/src/services/transcript_parser.py:127`, `services/analysis-engine/src/services/transcript_parser.py:140`).
- Impact: If actual stored terminal output contains proper Unicode glyphs, TUI detection and cleanup will miss them. If stored output is mojibake, the code is accidentally coupled to that corruption. Either way, parsing is fragile and analysis can be based on noisy or missing transcript turns.
- Suggested fix: Add fixture-based parser tests with raw stored interactions, normalize encoding once, and make regexes target the real stored representation deliberately.

### AE-P1-004: TUI extraction can drop short but meaningful candidate actions

- Status: Open
- Area: Transcript parsing / candidate evidence
- Evidence: `_extract_tui_conversation()` ignores prompt-marker text under 30 chars and input prompt records under 40 chars (`services/analysis-engine/src/services/transcript_parser.py:140`). `_clean_tui_text()` also strips isolated single letters (`services/analysis-engine/src/services/transcript_parser.py:96`).
- Impact: Commands like `ls`, `pwd`, `npm test`, `git diff`, `pytest`, or short diagnostic prompts may disappear from the transcript. This directly affects scoring for debugging, iteration, and efficiency.
- Suggested fix: Preserve short commands and known shell/tool patterns; apply length thresholds only after classifying likely noise.

### AE-P1-005: Quality gate assesses raw interactions instead of parsed candidate turns

- Status: Open
- Area: Quality gate / scoring reliability
- Evidence: `TranscriptQualityGate.assess()` counts raw `direction == "input"` records (`services/analysis-engine/src/services/transcript_quality.py:33`) even though the parser may reconstruct, collapse, drop, or append interview turns before analysis (`services/analysis-engine/src/services/transcript_parser.py:486`).
- Impact: A noisy raw session can pass the quality gate even if parsed candidate content is empty or badly truncated. Conversely, meaningful reconstructed TUI prompts may fail if raw input records are sparse.
- Suggested fix: Have the parser return structured parsed turns and run quality checks on those turns, not the raw rows.

### AE-P1-006: Transcript truncation can exceed the configured max length when candidate content alone is large

- Status: Open
- Area: Transcript sizing / model reliability
- Evidence: `_truncate_ai_responses()` subtracts candidate length from `_MAX_TRANSCRIPT_LENGTH`, but if candidate content already exceeds the limit, `remaining` becomes negative and the method still keeps all candidate content (`services/analysis-engine/src/services/transcript_parser.py:385`, `services/analysis-engine/src/services/transcript_parser.py:403`).
- Impact: Large candidate prompts or pasted code can push requests beyond intended model/token budgets, increasing latency, cost, and failure risk.
- Suggested fix: Enforce a true global budget with role-aware truncation/summarization and explicit notation for omitted content.

### AE-P1-007: Evidence verification can mark fabricated citations as verified by segment reference alone

- Status: Open
- Area: Evidence verification / hiring output accuracy
- Evidence: `_fuzzy_match()` returns verified if an evidence item includes any existing `#N` segment reference (`services/analysis-engine/src/services/evidence_verifier.py:74`). It also uses a low global similarity threshold of `0.4` (`services/analysis-engine/src/services/evidence_verifier.py:10`, `services/analysis-engine/src/services/evidence_verifier.py:87`).
- Impact: A model can cite a real segment number while fabricating the claim, and the verifier will still bless it. This undermines the anti-hallucination guardrail.
- Suggested fix: Verify quoted substrings against the referenced segment content, and treat bare segment references as insufficient.

### AE-P1-008: Evidence verification ignores `observed_points`

- Status: Open
- Area: Evidence verification / dimension details
- Evidence: `EvidenceVerifier.verify()` only iterates `dim_data["evidence"]` (`services/analysis-engine/src/services/evidence_verifier.py:98`). The richer `observed_points[].transcript_quote` fields are generated and saved but not verified.
- Impact: The UI may display detailed observed points that contain fabricated or inaccurate transcript quotes, even when the simpler evidence list was checked.
- Suggested fix: Verify every `observed_points[].transcript_quote` and annotate/drop unverified observed points before saving.

### AE-P1-009: Missing DB connection timeout and pool cleanup

- Status: Open
- Area: Database reliability
- Evidence: `_get_pool()` creates an asyncpg pool with only `min_size` and `max_size` (`services/analysis-engine/src/routers/analysis.py:51`). Shutdown stops workers but does not close `_pool` (`services/analysis-engine/src/routers/analysis.py:70`).
- Impact: Startup or query paths can hang on database connectivity issues, and shutdown can leave connections to be cleaned up by process termination.
- Suggested fix: Configure connect/command timeouts and close the pool during shutdown.

## P2

### AE-P2-001: Analysis engine error details are swallowed by web API responses

- Status: Open
- Area: Web API / operator UX
- Evidence: The web route logs the engine body but returns a generic `Analysis engine failed` (`apps/web/src/app/api/analysis/[sessionId]/route.ts:73`, `apps/web/src/app/api/analysis/[sessionId]/route.ts:76`). Enrichment and narrative routes similarly return generic failures (`apps/web/src/app/api/analysis/[sessionId]/enrich-dimensions/route.ts:38`, `apps/web/src/app/api/analysis/[sessionId]/transcript-narrative/route.ts:61`).
- Impact: The UI cannot distinguish timeout, invalid status, missing analysis, provider failure, or malformed response. Users and support staff lose actionable context.
- Suggested fix: Return normalized error codes and safe messages from the engine, and map them to user-facing states in the web API.

### AE-P2-002: Cost tracking uses hard-coded Gemini rates instead of configured cost settings

- Status: Open
- Area: Cost tracking
- Evidence: `_analyze_session_impl()` computes cost with literal `$0.15` and `$0.60` per million tokens (`services/analysis-engine/src/routers/analysis.py:627`), while `cost_settings` exists for configurable rates (`database/migrations/003_cost_tracking.sql:13`).
- Impact: Cost reports drift if pricing or company-specific settings change.
- Suggested fix: Read configured rates, cache them safely, and fall back to defaults only when settings are absent.

### AE-P2-003: Canned insufficient-data dimensions omit newer dimension fields

- Status: Open
- Area: Schema consistency
- Evidence: `TranscriptQualityGate` returns dimensions with `score`, `narrative`, and `evidence`, but omits `observed_points` and `expected_standard` (`services/analysis-engine/src/services/transcript_quality.py:84`, `services/analysis-engine/src/models/schemas.py:24`).
- Impact: Consumers that assume the newer dimension shape can render inconsistent or empty states for quality-gated sessions.
- Suggested fix: Include `observed_points: []` and an `expected_standard` message in canned dimensions.

### AE-P2-004: Key moment annotation lookup likely confuses model index with interaction sequence number

- Status: Open
- Area: Report persistence
- Evidence: `interaction_index` from model output is used directly as `interactions.sequence_num` (`services/analysis-engine/src/services/report_generator.py:128`, `services/analysis-engine/src/services/report_generator.py:137`). The transcript parser renumbers formatted segments from `1` after collapsing/truncation (`services/analysis-engine/src/services/transcript_parser.py:486`).
- Impact: Key moment annotations can attach to the wrong raw interaction or fail to attach at all.
- Suggested fix: Preserve raw interaction IDs or sequence ranges in parsed transcript segments and require the model to cite those stable IDs.

### AE-P2-005: Health check reports only API-key presence, not dependency readiness

- Status: Open
- Area: Operations
- Evidence: `/health` returns `status: healthy` plus `gemini_key_set` only (`services/analysis-engine/src/main.py:80`).
- Impact: Load balancers or monitoring may treat the engine as healthy even when the database is unreachable, workers failed to start, or provider calls are failing.
- Suggested fix: Split liveness and readiness; readiness should check DB connectivity, worker count, queue depth, and provider configuration.

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
