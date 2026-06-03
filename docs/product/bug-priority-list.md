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

### TERM-P1-001: Terminal UI feels laggy during interactive sessions

- Status: Open
- Area: Terminal UI / candidate experience
- Evidence: Recruiter/user report that the in-browser terminal UI has noticeable lag. The current terminal client streams WebSocket output directly into xterm (`apps/web/src/hooks/useTerminal.ts`) and forwards input immediately, but there is no latency instrumentation, output batching metric, render-pressure guard, or visible reconnect/degraded-performance state.
- Impact: Candidates may experience delayed keystrokes, slow command feedback, or poor confidence that the assessment environment is responding. Even when backend execution is healthy, perceived terminal lag can hurt completion quality and supportability.
- Suggested fix: Add lightweight client/server timing diagnostics first: measure input-to-echo latency, WebSocket round-trip time, output chunk sizes/rate, and xterm render backlog. Then optimize based on findings, likely by batching high-frequency terminal writes with `requestAnimationFrame`, reducing unnecessary React work around the terminal, and surfacing a degraded-connection state when network/server latency is the root cause.

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

- Status: V1 Done
- Area: Transcript parsing / analysis accuracy
- Original evidence: The parser comments and regexes included mojibake/corrupted representations of box-drawing, prompt-marker, spinner, and separator glyphs in TUI stripping/detection (`services/analysis-engine/src/services/transcript_parser.py`).
- Original impact: If actual stored terminal output contained proper Unicode glyphs, TUI detection and cleanup could miss them. If stored output was mojibake, the code was accidentally coupled to that corruption. Either way, parsing was fragile and analysis could be based on noisy or missing transcript turns.
- V1 resolution: Added a real Claude Code TUI interaction fixture and regression tests for preserving candidate prompts, preserving useful AI responses, removing `bypasspermissionson`/`bypass permissions on`, removing spinner/status fragments, removing raw prompt/status chrome, and ensuring real AI responses are not truncated. `TranscriptParser` now normalizes TUI redraw/control artifacts before extraction, handles replacement characters deliberately, strips Claude Code status phrases including smashed variants, removes spinner fragments more aggressively, extracts prompt-marker text line-by-line, and only truncates raw terminal output rather than candidate prompts or AI responses.
- Remaining limitation: The cleaned transcript can still contain some smashed or duplicated prose from terminal redraw artifacts, such as missing spaces inside AI response text. This is much less damaging than the removed TUI chrome, but it is still not ideal for readability and evidence quotes.
- Next phases:
  - V2: Add more real fixtures from different Claude Code sessions, including longer sessions, multiple prompts, failed commands, file edits, and high-output terminal blocks.
  - V2: Improve readability normalization for smashed words and duplicated AI prose without inventing text or changing the factual transcript.
  - V2: Add parser quality metrics, such as counts of removed chrome lines, retained candidate turns, retained AI turns, and transcript truncation markers.
  - V3: Consider storing a structured transcript alongside the rendered text so analysis can consume candidate prompts, AI responses, commands, terminal output, and interview dialogue separately.

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

- Status: Fixed
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

### WEB-P1-001: Paid companies without `firebase_uid` bypass subscription verification

- Status: Open
- Area: Subscription quota enforcement
- Evidence: `checkEnrollmentStatus()` verifies Firestore subscription state only inside the `if (company.firebase_uid)` branch. If a company row has `plan != 'trial'` but no `firebase_uid`, the function falls through to `checkPaidPlan(company.plan, sessionsUsed, null)` and allows session creation based only on the local plan column (`apps/web/src/lib/enrollment.ts:100`, `apps/web/src/lib/enrollment.ts:123`).
- Impact: A manually edited, imported, or corrupted company row can receive paid-plan quota without an active subscription record. This can bypass billing/enrollment enforcement for creating candidate sessions.
- Suggested fix: Require an active subscription for every non-trial company unless an explicit admin/internal override flag exists. Treat missing `firebase_uid` on paid plans as `subscription_lapsed` or `not_enrolled`, and add a regression test for paid-plan rows with null Firebase UID.

### WEB-P1-002: Active subscriptions are trusted without checking `currentPeriodEnd`

- Status: Open
- Area: Subscription lifecycle / quota reset
- Evidence: `readActiveSubscription()` reads both `currentPeriodStart` and `currentPeriodEnd`, but `checkEnrollmentStatus()` only uses `currentPeriodStart` as the quota anchor. The Firestore query accepts any document with `status == 'ACTIVE'` and never verifies that `currentPeriodEnd` is still in the future (`apps/web/src/lib/enrollment.ts:119`, `apps/web/src/lib/enrollment.ts:204`).
- Impact: If a webhook or manual sync fails to flip an expired subscription away from `ACTIVE`, the platform may continue allowing paid-plan session creation after the billing period has ended. Conversely, stale period dates can make quota windows drift from the actual subscription state.
- Suggested fix: Validate `currentPeriodEnd` against the current time before treating a subscription as active, and decide a safe fallback when period dates are missing or malformed. Log/report malformed active subscription documents.

### WEB-P1-003: Subscription plan tier can drift from purchased plan

- Status: Open
- Area: Subscription quota enforcement
- Evidence: When a trial company has an active subscription, `checkEnrollmentStatus()` unconditionally updates the company to `starter`. Existing paid companies use `companies.plan` for quota limits rather than reading or reconciling the active subscription's purchased tier (`apps/web/src/lib/enrollment.ts:55`, `apps/web/src/lib/enrollment.ts:119`).
- Impact: A growth or enterprise purchase can be under-allocated as starter, or a downgraded/cancelled tier can continue receiving the old local quota. Remaining-session calculations and candidate admission can diverge from what the customer actually paid for.
- Suggested fix: Store the purchased plan tier from the billing/subscription source of truth and reconcile `companies.plan` on every subscription status check or webhook. Avoid defaulting paid trial upgrades to starter unless the subscription explicitly says starter.

### WEB-P1-004: Subscription status checks use different Firestore sources of truth

- Status: Open
- Area: Subscription access consistency
- Evidence: Paid-plan quota enforcement in `checkEnrollmentStatus()` treats an active Firestore `Subscriptions` document as the source of truth for paid access and billing-period quota anchors (`apps/web/src/lib/enrollment.ts:198`). However, `/api/subscription/status` reports enrollment by reading `Enrollments/{firebase_uid}_{ARCEVAL_ENROLLMENT_ID}` instead (`apps/web/src/app/api/subscription/status/route.ts:31`).
- Impact: A company can appear paid for candidate-session quota while the subscription status endpoint reports not enrolled, or appear enrolled in the UI while quota enforcement treats the subscription as lapsed. This is especially risky because Vizuara's subscription activation webhook creates the `Enrollments` document only after successfully loading `Users/{uid}`; locally-created ArcEval accounts may have an active `Subscriptions` document but no matching `Enrollments` document if the Vizuara `Users` profile is missing.
- Suggested fix: Pick one canonical source for paid ArcEval access. Prefer `Subscriptions` for paid-plan enforcement because it contains `status`, `currentPeriodStart`, and `currentPeriodEnd` for billing-period quota resets. Update `/api/subscription/status` to use the same subscription reader, optionally returning matching `Enrollments` data as secondary/debug context, and add tests for `Subscriptions ACTIVE / Enrollments missing` and `Enrollments ACTIVE / Subscriptions missing` cases.

### WEB-P1-005: Private GitHub repository blocks repeatable VM deployments

- Status: Open
- Area: Deployment operations / release reliability
- Evidence: The production system is hosted on a GCP VM, while the GitHub repository is private. Manual VM updates require an authenticated way to fetch private repository changes, but the current deployment process does not yet have a finalized private-repo access strategy or CI/CD path. Deploy keys may not be available in the target environment, and relying on ad hoc personal credentials on the VM is operationally risky.
- Impact: Production can lag behind committed fixes, deployment steps become person-dependent, and emergency updates can be blocked by missing credentials. Workarounds such as making the repository public or storing broad personal tokens on the VM would weaken security.
- Suggested fix: Keep the repository private and implement a controlled deployment path. Prefer GitHub Actions CI/CD that checks out the private repo inside GitHub, validates/builds the system, then deploys to the VM using scoped VM SSH credentials stored in GitHub environments/secrets. If VM-side pulls remain necessary, use a fine-grained read-only token or GitHub App installation token scoped to this repository, with rotation and revocation documented.

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

- Status: Obsolete
- Area: Web API / admin challenge quotas
- Evidence: The candidate apply route determines whether a challenge is admin-created by loading the owner company email and calling `isAdmin(company.email)` without access to the owner's Firebase role claim (`apps/web/src/app/api/challenges/[id]/apply/route.ts:63`).
- Impact: A challenge created by a role-claim admin can be treated as a regular company challenge during candidate application, so plan/trial quota checks may apply instead of the admin challenge `sessions_limit` behavior.
- Resolution: No longer valid as written. Admin users resolve to `companyId: null` and company challenge creation/duplication routes require a company workspace, so role-claim admins cannot create company-owned challenges through the current flow. The stale `isAdmin(company.email)` exemption in challenge-access remains a possible cleanup item, but it is not an active P2 bug while admin-owned challenges are unsupported.

### WEB-P2-002: Challenge session-limit validation compares total cap to remaining plan quota

- Status: Open
- Area: Challenge access settings / quota UX
- Evidence: `validateChallengeSessionLimit()` accepts only `companyId` and the requested `sessionsLimit`, then rejects when `sessionsLimit > planStatus.sessionsLimit - planStatus.sessionsUsed`. It does not know whether this is a new challenge, an existing challenge, or how many sessions already belong to that challenge (`apps/web/src/lib/challenge-settings.ts:3`, `apps/web/src/app/api/challenges/[id]/route.ts:160`).
- Impact: Editing an existing challenge can be blocked even when the requested cap is sensible for that challenge. For example, a company with 49 used of 50 cannot set an existing challenge's cap to 50, even if most of those 49 sessions are already on that challenge and the edit would only allow one more candidate.
- Suggested fix: For updates, validate incremental capacity using the existing challenge's session count/current cap, or stop treating per-challenge caps as plan quota reservations. Add tests for changing a limit on a challenge that already has sessions.

### WEB-P2-003: Public apply page can show an assessment as available when quota/capacity is exhausted

- Status: Implemented
- Area: Candidate apply UX / quota enforcement
- Evidence: The public apply `GET` route calls `validateChallengeAccess(challenge)` without `enforceCapacity` or `enforcePlanQuota`, while the apply `POST` route performs the stricter transactional check with both flags before creating a session (`apps/web/src/app/api/challenges/[id]/apply/route.ts:134`, `apps/web/src/app/api/challenges/[id]/apply/route.ts:91`).
- Impact: Candidates can see an assessment page as available, fill in their details, and only then be rejected because the challenge cap or company plan quota is exhausted. That creates a poor candidate experience and unnecessary support burden for companies.
- Suggested fix: Include capacity and plan availability in the public availability check, using customer-safe messages that do not expose internal billing details. Keep the transactional `POST` check as the final source of truth.
- Implementation notes: The public apply `GET` route now calls `validateChallengeAccess(challenge, { enforceCapacity: true, enforcePlanQuota: true })`, so the apply page can show customer-safe unavailable states for exhausted challenge capacity or company quota before candidates submit the form. The transactional `POST` checks remain unchanged as the final source of truth.

### WEB-P2-004: Pending invitations reserve plan quota

- Status: Obsolete
- Area: Subscription quota accounting
- Evidence: `countSessionsSince()` and per-challenge capacity checks count sessions where `candidate_lifecycle_status IS NULL OR started_at IS NOT NULL`, so ordinary pending invitations reserve quota/capacity while unstarted lifecycle-excluded candidates release it (`apps/web/src/lib/enrollment.ts:164`, `apps/web/src/lib/challenge-access.ts:97`).
- Impact: This is the intended policy. Pending invitations reserve a slot so customers cannot over-invite beyond plan or challenge capacity and later create ambiguity about which candidates are valid once they start.
- Resolution: No bug fix planned. Keep existing pending/active session reuse ahead of quota checks, and use lifecycle states such as revoked, no-show, withdrawn, or disqualified to release unstarted reservations.

### WEB-P2-005: Missing `currentPeriodStart` makes paid quota fall back to all-time usage

- Status: Open
- Area: Subscription quota reset
- Evidence: `readActiveSubscription()` can return an active subscription with `currentPeriodStart: null`, and `checkEnrollmentStatus()` passes that value to `countSessionsSince()`. A null anchor makes the counter count all company sessions instead of only the billing period (`apps/web/src/lib/enrollment.ts:119`, `apps/web/src/lib/enrollment.ts:164`).
- Impact: A malformed active subscription document can prevent quota reset on renewal and incorrectly block paid customers after historical usage exceeds the plan limit.
- Suggested fix: Treat active subscription documents without a valid `currentPeriodStart` as malformed. Either block with a clear operator-visible diagnostic or fall back to a deliberate provider-derived anchor, but do not silently count all-time paid usage.

### WEB-P2-006: Lapsed subscription usage is displayed as all-time usage

- Status: Open
- Area: Subscription UX / billing accuracy
- Evidence: In the `subscription_lapsed` branch, `checkEnrollmentStatus()` calls `countSessionsSince(companyId, null)` but dashboard copy says "this period" for lapsed subscriptions (`apps/web/src/lib/enrollment.ts:107`, `apps/web/src/app/dashboard/page.tsx:126`).
- Impact: Lapsed customers can see inflated or misleading usage numbers, especially long-lived accounts that have many historical sessions. The account is blocked either way, but the displayed explanation can be wrong.
- Suggested fix: Preserve the last known billing-period anchor/end on the company or subscription record and use that for lapsed-period usage display, or change the copy to avoid saying "this period" when only all-time usage is available.

### WEB-P2-007: Public apply availability check can trigger subscription-side effects

- Status: Open
- Area: Candidate apply UX / subscription state
- Evidence: `GET /api/challenges/[id]/apply` now calls `validateChallengeAccess(challenge, { enforceCapacity: true, enforcePlanQuota: true })`. The plan quota path calls `checkEnrollmentStatus()`, which can read Firestore and update a trial company to the starter plan when it finds an active subscription (`apps/web/src/app/api/challenges/[id]/apply/route.ts:134`, `apps/web/src/lib/challenge-access.ts:118`, `apps/web/src/lib/enrollment.ts:52`, `apps/web/src/lib/enrollment.ts:57`).
- Impact: A public candidate page load can perform subscription reconciliation that was previously only triggered by session creation or authenticated product surfaces. This is probably benign, but it makes a read-style availability check unexpectedly write company state and depend on Firestore availability.
- Suggested fix: Split quota checking into a read-only public availability path and a mutating reconciliation path, or make `checkEnrollmentStatus()` accept an option to disable subscription state updates for public candidate reads. Keep the transactional apply `POST` as the final source of truth for session creation.

## P3

### AE-P3-001: Analysis engine naming still says Claude while implementation uses Gemini

- Status: Open
- Area: Maintainability
- Evidence: Service class is `ClaudeAnalyzer`, raw response field is named `raw_claude_response`, and comments mention Claude, while the implementation uses Gemini (`services/analysis-engine/src/services/claude_analyzer.py:206`, `services/analysis-engine/src/services/report_generator.py:56`).
- Impact: Naming increases confusion during debugging and cost analysis.
- Deferral note: Leave this cleanup for a future coordinated migration. In
  particular, `raw_claude_response` is a persisted database column, so renaming
  it during the current staging-to-main catch-up could break older code paths or
  external consumers that still expect the legacy column name.
- Suggested future fix: Rename code-facing analyzer identifiers and migrate
  DB-facing aliases carefully, or add compatibility comments while migrating.

### AE-P3-002: Root service metadata does not list current background-analysis endpoints

- Status: Fixed
- Area: API discoverability
- Evidence: `/` lists `POST /analyze` and `GET /health`, but not `/analyze/start`, `/analyze/enrich-dimensions`, or `/analyze/transcript-narrative` (`services/analysis-engine/src/main.py:55`).
- Impact: Developers may discover or test the wrong endpoint.
- Resolution: Root service metadata now lists the background-analysis endpoints
  alongside `/analyze`, `/health`, and `/ready`.

### WEB-P3-001: Upgrade/payment links are sourced inconsistently across plan states

- Status: Open
- Area: Subscription UX
- Evidence: Trial and missing-company paths use `ARCEVAL_PAYMENT_URL`, while paid quota-exceeded paths build a `/pricing` URL from `NEXT_PUBLIC_VIZUARA_URL` (`apps/web/src/lib/enrollment.ts:5`, `apps/web/src/lib/enrollment.ts:133`).
- Impact: Different quota failure states can send customers to different upgrade or renewal destinations. This is low risk functionally, but confusing if the intended billing checkout URL differs from the marketing pricing page.
- Suggested fix: Centralize the billing/upgrade URL decision and return the same configured destination for equivalent upgrade states, with separate renewal links only when intentionally different.
