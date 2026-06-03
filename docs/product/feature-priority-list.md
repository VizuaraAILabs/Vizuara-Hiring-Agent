# Feature Priority List

Living feature tracker for assessment controls, candidate access, reporting, operations, and admin workflows.

This first iteration is based on the requested assessment-link expiry workflow plus a scan of the current web app, API routes, database schema, and analysis/reporting surfaces. Priorities use:

- `P0`: prevents unintended license/quota consumption, blocks live recruiting control, or protects candidate workflow integrity.
- `P1`: materially improves recruiter operations, assessment quality, or supportability for active customers.
- `P2`: improves admin efficiency, reporting depth, observability, or workflow polish after P0/P1.
- `P3`: lower-risk product polish, quality-of-life improvements, and cleanup.

## P0

### FEAT-P0-001: Assessment links should support a start and end validity window

- Status: Implemented
- Area: Assessment access / license control
- Source: Customer request from Yash, 1PharmacyNetwork, on May 5, 2026: recruiting activity had ended, but a student later used the assessment link and consumed a LIC. Requested behavior: set start and end date, and the link is valid only during that interval.
- Evidence: Public application currently fetches and creates sessions through `apps/web/src/app/api/challenges/[id]/apply/route.ts` with no time-window check. The `challenges` table has `is_active` and `created_at`, but no `starts_at` or `ends_at` fields in `database/migrations/001_pg_schema.sql`. The challenge creation and detail UI expose time limit, session limit, allowed emails, and starter files, but no link validity dates.
- Impact: Candidates can start after a campus drive or recruiting window is over, consuming license/quota unexpectedly and creating operational noise for recruiters.
- Suggested fix: Add nullable `starts_at` and `ends_at` columns to `challenges`; expose date/time controls in create/edit/detail screens; enforce the window in both public apply GET/POST and direct session start paths. Show clear candidate-facing states for "not open yet" and "assessment expired"; avoid consuming session quota/license when outside the valid window.

### FEAT-P0-002: Recruiters should be able to pause or close an assessment link

- Status: Implemented
- Area: Assessment access / recruiter control
- Evidence: Schema includes `challenges.is_active`, but public apply GET/POST does not check it in `apps/web/src/app/api/challenges/[id]/apply/route.ts`, and the dashboard detail page has no active/inactive control.
- Impact: Recruiters cannot immediately stop future candidate access without changing code/data manually. This is the manual escape hatch needed alongside date-based expiry.
- Implementation notes: Added an Open/Closed assessment access control on challenge detail pages with an explicit close-confirmation warning. Closing blocks new candidate registration, recruiter invite generation, and pending session starts through shared `is_active` enforcement, while active sessions can continue and completed reports remain available. The shareable link and challenge header show the current open/closed state.

### FEAT-P0-003: Direct invite links should follow the same access rules as shareable apply links

- Status: Implemented
- Area: Assessment access / consistency
- Evidence: `apps/web/src/app/api/challenges/[id]/invite/route.ts` creates a session directly and does not enforce allowed emails, challenge active state, plan quota, session limit, or any future link validity window. The public apply route enforces allowed emails, session limit, and plan quota.
- Impact: Recruiters/admins may accidentally create usable candidate sessions after an assessment is closed, expired, or at capacity. Candidate access behavior depends on which invitation path was used.
- Suggested fix: Centralize challenge-access validation in a shared helper and call it from public apply, recruiter invite, and session start routes.

### FEAT-P0-004: Companies should set per-challenge session limits enforced across all invite paths

- Status: Implemented
- Area: Assessment access / license control
- Evidence: Companies can set `sessions_limit` during manual challenge creation, generated-challenge creation, and from the challenge detail `Access Control` tab. The create/edit APIs validate the configured limit against remaining plan availability. Public shareable-link registration and personalized invite creation both call the shared challenge-access helper with capacity enforcement.
- Impact: Companies cannot self-serve participant caps for a campus drive or role-specific assessment, and personalized invites can exceed the intended challenge capacity, creating quota/licensing surprises.
- Implementation notes: Session creation paths serialize duplicate lookup, capacity/quota validation, and insert with advisory transaction locks to avoid simultaneous requests exceeding the cap. Existing pending/active sessions are reused rather than consuming additional capacity.

## P1

### FEAT-P1-001: Add editable challenge settings after creation

- Status: Implemented
- Area: Recruiter dashboard / assessment management
- Evidence: `apps/web/src/app/api/challenges/[id]/route.ts` only supports updating `starter_files`; allowed emails have a dedicated endpoint, but title, description, time limit, session limit, role, tech stack, seniority, focus areas, context, and active/link-window settings are not editable through one challenge settings screen.
- Impact: Recruiters must recreate assessments to fix setup mistakes or change drive logistics, which fragments submissions across multiple challenge records.
- Suggested fix: Add a challenge settings page/API that updates core metadata and access controls while protecting fields that should not change after candidates have started, such as time limit or starter files unless explicitly confirmed.

### FEAT-P1-002: Add reusable invite/email campaign support for assessments

- Status: Proposed
- Area: Candidate communication / recruiter operations
- Evidence: The challenge detail page generates one invite link at a time. Admin has bulk email tooling for companies in `apps/web/src/app/dashboard/admin/page.tsx`, but recruiters cannot bulk-import candidates, email assessment links, or track sent reminders from the challenge page.
- Impact: Campus drives and batch hiring workflows require manual copy/paste and external tracking.
- Suggested fix: Add CSV/email-list import, bulk invite generation, email send history, resend/reminder actions, and bounced/failed-send status if supported by the email provider.

### FEAT-P1-005: Send personalized invite emails with custom company-authored message bodies

- Status: Implemented
- Area: Candidate communication / recruiter operations
- Implementation notes: Added a saved per-challenge invite email subject/body, merge fields for candidate name, challenge title, assessment link, time limit, access window, and company name, and an optional send-email action in the Invites tab. Personalized invite creation still returns the manual fallback link, sends through the existing Brevo provider when requested, and records `not_sent`, `sent`, or `failed` delivery state on the session.

### FEAT-P1-006: Calibrate report recommendation labels against overall scores

- Status: Proposed
- Area: Analysis quality / recruiter trust
- Evidence: Candidate reports can show a high `overall_score` with a contradictory `hiring_recommendation`; for example, a score of 83 displayed with a "Neutral" badge. `apps/web/src/components/report/ReportHeader.tsx` renders the numeric score from `analysis.overall_score`, while the badge comes independently from `analysis.hiring_recommendation`. The analysis prompt in `services/analysis-engine/src/services/claude_analyzer.py` requests both fields but does not define explicit consistency rules between score bands and recommendation labels.
- Impact: Recruiters may lose confidence in the report when the headline score and recommendation badge appear to disagree, especially in shareable/exported reports.
- Suggested fix: Decide whether the badge should be score-derived or model-derived. If model-derived, add prompt and/or post-processing calibration rules so recommendations cannot contradict score bands without an explicit rationale, then surface that rationale in the report when exceptions occur.

### FEAT-P1-003: Add candidate lifecycle controls

- Status: Implemented
- Area: Candidate management / recruiter operations
- Implementation notes: Added audited lifecycle controls for candidate sessions without adding a separate candidate CRM. Recruiters can send invite email from the Candidates tab, regenerate and copy a pending unstarted invite link, revoke unused invites, and mark candidates as no-show, withdrawn, or disqualified. Manual lifecycle states block candidate access until cleared. Existing recruiter notes remain the notes surface; retakes, resets, and time extensions are intentionally deferred.

### FEAT-P1-004: Add report export and sharing controls

- Status: Implemented
- Area: Reports / hiring workflow
- Evidence: Analysis reports are rendered in-app under `apps/web/src/app/dashboard/challenges/[id]/submissions/[subId]/page.tsx`, with report components for scores, transcript, workspace, timeline, and evidence. There is no obvious PDF/CSV export, public read-only share link, or hiring-panel handoff workflow.
- Impact: Recruiters often need to share candidate results with hiring managers outside the platform or archive reports in an ATS.
- Suggested fix: Add PDF export, CSV score export per challenge, and optional expiring read-only report links with recruiter-controlled access.
- Implementation notes: Added browser print/PDF export for candidate reports, challenge-level CSV score export from the Candidates tab, and expiring read-only report links that recruiters can create, replace, copy, or revoke from the report page. The first pass keeps shared reports read-only and excludes recruiter-only review controls.

## P2

### FEAT-P2-001: Add assessment-level analytics dashboard

- Status: Implemented
- Area: Analytics / recruiter insight
- Evidence: Challenge detail shows candidate rows and status counts implicitly, while admin has platform cost/usage summaries. There is no per-assessment funnel for invited, started, completed, analyzed, average score, recommendation distribution, no-shows, or time-to-complete.
- Impact: Recruiters cannot quickly understand drive performance or identify weak/strong cohorts without opening reports one by one.
- Suggested fix: Add a challenge analytics panel with completion funnel, score distribution, recommendation breakdown, average duration, assessment-window utilization, and downloadable candidate table.
- Implementation notes: Added an Analytics tab on challenge detail backed by `/api/challenges/[id]/analytics`. The tab shows invited/started/completed/analyzed funnel, average score and duration, score bands, recommendation and decision breakdowns, candidate lifecycle counts, assessment-window/capacity utilization, and a candidate-table CSV export.

### FEAT-P2-002: Add assessment template versioning

- Status: Proposed
- Area: Challenge generation / content governance
- Evidence: Challenges store title, description, starter files, role, tech stack, seniority, focus areas, and context directly. Starter files can be edited, and AI generation exists, but there is no version field or immutable snapshot model for template lineage.
- Impact: When challenge content changes over time, recruiters cannot compare cohorts reliably or tell which candidate received which version beyond the stored session workspace snapshot.
- Suggested fix: Add challenge/template versions, record the version on each session, and show version history with diff/restore for description and starter files.

### FEAT-P2-003: Add solution ownership and session integrity signals

- Status: V1 Implemented
- Area: Candidate ownership / reporting
- Evidence: ArcEval intentionally allows candidates to use AI assistants and external references such as Google, so the useful hiring signal is not whether outside help was used. The current reports assess AI collaboration quality, but there is no dedicated surface for whether the candidate appeared to understand, steer, verify, and own the final work. The terminal and interaction logs can show validation behavior, large late-stage code drops, long idle gaps, repeated reconnects, and workspace similarity, but those signals are not summarized for reviewers.
- Impact: Recruiters need evidence about solution ownership without treating permitted AI or web research as misconduct. A candidate who uses AI well, tests the result, explains trade-offs, and iterates should be distinguished from a candidate who submits a large unverified solution with little interaction trail. Cohort-level similarity is also important when many candidates produce near-identical final workspaces.
- Implementation notes: Added a deterministic "Solution Ownership" report tab backed by `/api/analysis/[sessionId]/integrity`. The summary uses existing terminal interactions, file-edit metadata, session timing, workspace snapshots, and same-challenge workspace comparison to surface neutral evidence: verification trail, large edits, late large changes without follow-up validation, long idle gaps, short completion, and workspace similarity. The UI explicitly frames these as context signals, not misconduct findings.

### FEAT-P2-004: Add operational notifications for analysis failures and pending work

- Status: Implemented
- Area: Operations / support
- Evidence: The dashboard polls queued/analyzing sessions, and admin shows pending assessments, but there is no notification workflow when analysis stays queued/analyzing too long or fails.
- Impact: Recruiters may wait for reports without knowing whether intervention is needed.
- Implementation notes: Added recruiter dashboard analysis alerts for completed-but-not-started, queued too long, analyzing too long, and failed analysis sessions. Alerts include timestamps, latest error details where available, challenge links, and retry actions for retryable states.

### FEAT-P2-005: Add company-level plan and quota management in admin

- Status: Proposed
- Area: Admin / subscriptions
- Evidence: Plan/quota enforcement exists through enrollment checks, and admin lists companies with plan labels, sessions, costs, and pending counts. There is no visible admin UI for changing a company's plan, extending trial, granting extra assessments, or viewing quota history.
- Impact: Support and sales workflows require database/manual intervention for common customer requests.
- Suggested fix: Add admin controls for plan tier, trial extension, one-off quota grants, period reset, and a quota/audit history table.

## P3

### FEAT-P3-001: Add archived/completed grouping for old assessments

- Status: Implemented
- Area: Dashboard organization
- Evidence: Challenges are listed by creation date and remain visible indefinitely. There is no archive state or folder/grouping model.
- Impact: Recruiter dashboards will become noisy after several campus drives or hiring cycles.
- Implementation notes: Added archive/unarchive, dashboard filters for active/closed/archived/all, and a single optional cohort label for lightweight grouping. Archiving is dashboard organization only; manual close state and assessment start/end windows continue to control candidate access.

### FEAT-P3-002: Add copy improvements for candidate-facing unavailable states

- Status: Implemented
- Area: Candidate UX
- Evidence: Current candidate errors include generic messages such as "This challenge link is invalid or no longer available" and "This assessment is temporarily unavailable. Please contact the company."
- Impact: Once expiry, closed links, quotas, and allowlists are all enforced, candidates need clearer guidance without exposing private plan details.
- Suggested fix: Standardize candidate-facing unavailable states: not open yet, expired, closed by recruiter, invite-only, already submitted, at capacity, and temporarily unavailable.
- Implementation notes: Added a shared candidate-safe unavailable copy map with stable reason codes, titles, and messages. Public apply and session APIs now return structured unavailable payloads for invalid links, not open yet, expired, closed, invite-only, already submitted/submitted for evaluation, at capacity, revoked invites, inactive sessions, and temporary unavailability. Candidate apply, session intro, and terminal unavailable screens now preserve and render those specific messages instead of falling back to generic invalid-link copy.

### FEAT-P3-003: Add recruiter notes and decision labels on candidate reports

- Status: Implemented
- Area: Hiring workflow / collaboration
- Evidence: Reports contain generated recommendations, strengths, and areas for growth, but there is no recruiter-owned decision state or notes field on sessions.
- Impact: Teams need a lightweight place to record review decisions without relying on external spreadsheets.
- Suggested fix: Add decision labels such as shortlisted, hold, reject, hired, plus private notes and reviewer attribution.

### FEAT-P3-004: Add challenge duplication

- Status: Implemented
- Area: Dashboard productivity
- Evidence: New challenges can be created manually or from wizard/template flow, but there is no duplicate action on the challenge list/detail page.
- Impact: Similar campus drives or role variants require repetitive setup.
- Implementation notes: Added challenge duplication from dashboard cards and challenge detail. Duplicates copy assessment content and role metadata, optionally copy starter files, cohort label, allowed emails, and access window, and intentionally reset candidate access controls such as session limit, active state, archive state, and candidate sessions.
