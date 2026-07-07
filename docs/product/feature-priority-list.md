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

### FEAT-P0-005: Reduce idle analysis-engine database polling to prevent compute-quota exhaustion

- Status: Proposed
- Area: Operations / database cost control
- Evidence: The production `analysis` service starts background queue workers on startup and polls Postgres for queued `analysis_jobs`. The default `ANALYSIS_QUEUE_POLL_SECONDS` is `2` in `docker-compose.yml`, so the service can keep a serverless/compute-metered database awake even when no candidates are using the product. Production hit a database error stating, "Your account or project has exceeded the compute time quota. Upgrade your plan to increase limits," after showing 112 CU-hours despite low human usage.
- Impact: ArcEval can exhaust database compute quota and return 500s on admin/recruiter pages even with light customer traffic. This turns an internal background worker into a production availability and cost risk.
- Suggested fix: Increase the production idle polling interval immediately, for example `ANALYSIS_QUEUE_POLL_SECONDS=60` or `120`, and consider stopping the analysis service when not needed on very small deployments. Longer term, add exponential backoff when no jobs are found, wake the worker explicitly when `/analyze/start` enqueues a job, or move analysis dispatch to an event/queue mechanism that does not poll Postgres continuously. Add an operations note and alert for database compute quota consumption.

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

### FEAT-P1-007: Create a CI/CD pipeline for the hosted system

- Status: Proposed
- Area: Deployment operations / release reliability
- Evidence: The system is hosted on a GCP VM and currently relies on manual Git pulls and deployment commands. Existing docs cover environment variables, deployment troubleshooting, scaling strategy, and private GitHub pulls, but there is no automated pipeline that validates changes, builds images, deploys to the VM, and records deployment status.
- Impact: Manual deployments are easy to forget, repeat inconsistently, or run with unvalidated code. This increases the risk of downtime, missed migrations, stale sandbox images, and unclear rollback steps when production behavior changes.
- Suggested fix: Add a GitHub Actions workflow for CI checks on pull requests and controlled deployments from the production branch. The pipeline should run lint/typecheck/tests where available, build the web, terminal-server, analysis-engine, and sandbox images, push or transfer deployable artifacts securely, SSH into the GCP VM using repository secrets, run migrations and `scripts/deploy.sh`, perform health checks, and publish deployment logs/status. Include rollback guidance and make production secrets available only through GitHub environments or VM-local `.env.production`, never committed files.

### FEAT-P1-008: Add audit logging for destructive admin actions

- Status: Proposed
- Area: Admin operations / accountability
- Evidence: `/dashboard/admin` can delete a company through `DELETE /api/admin/companies/{companyId}`. That route permanently removes the ArcEval company profile, challenges, candidate sessions, interactions, analysis reports, annotations, feedback, and cost settings, while preserving historical usage events as deleted-company records. The action currently returns success to the UI, but there is no durable audit record of which admin performed the deletion, when it happened, which company was affected, or what related records were removed.
- Impact: Support and operations cannot reliably investigate accidental deletions, disputed changes, or security incidents. Destructive actions become hard to attribute after the target company row has been removed.
- Suggested fix: Add an `admin_audit_events` table and shared server helper for privileged actions. Log actor Firebase UID/email/role, action type, target type/id/name, request metadata such as IP/user agent when available, before/after snapshots or summary counts, and a timestamp. Start with company deletion, plan/quota changes, challenge deletion/archive state changes, candidate lifecycle overrides, and deployment-sensitive admin settings. Add an admin-only audit viewer with filters by actor, company, action, and date range.

### FEAT-P1-009: Add company team invite landing page

- Status: Proposed
- Area: Team accounts / onboarding
- Evidence: Company team invites currently send teammates to the normal signup page with a decorative `company` query parameter. Membership is safely claimed by invited email during session creation, but there is no invite-specific landing experience that confirms the company, role, invited email, or next step.
- Impact: Invited teammates may not understand whether they should sign in, sign up, or which email address must be used. This can create avoidable support questions during team onboarding.
- Suggested fix: Add a lightweight invite landing page that shows the company name, invited role, and invited email, then routes the user to login or signup. Keep the secure join logic server-side by email claim; do not trust the query string for authorization.

### FEAT-P1-010: Add team membership audit logging

- Status: Proposed
- Area: Team accounts / accountability
- Evidence: Owners can invite teammates, change roles, remove members, and re-invite removed members from Team Settings. These actions affect company access but currently do not create a durable audit trail.
- Impact: Companies and support cannot answer who invited a teammate, who changed a role, or who removed access after the fact.
- Suggested fix: Add audit events for team invite created, invite email sent/failed, invite resent, invite canceled, member joined, role changed, member removed, and member re-invited. Store actor member/user identity, target email/member id, old/new role or status, company id, timestamp, and request metadata where appropriate. Reuse or align with the broader admin audit event model when it exists.

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

### FEAT-P2-006: Add team seat limit management

- Status: Proposed
- Area: Team accounts / subscriptions
- Evidence: Team accounts add `companies.team_member_limit`, but the value defaults to `1` and there is no product or admin surface to change it by plan, company, or sales override.
- Impact: Team Settings can be present but unusable for most companies unless support manually updates the database. This also makes plan packaging unclear for Starter, Growth, and Enterprise tiers.
- Suggested fix: Tie `team_member_limit` to plan configuration or add an admin control for company-specific seat limits. Show clear owner-facing copy when the limit is reached, including upgrade/contact-sales guidance.

### FEAT-P2-007: Improve removed-member and blocked-account messaging

- Status: Proposed
- Area: Team accounts / user support
- Evidence: Removed members are blocked from logging in or creating a new owner account with the same email. The current message safely tells them access was removed and to ask the company owner to invite them again, but it does not distinguish support-owned remediation from company-owned access decisions.
- Impact: Removed users may contact platform support for an access decision that belongs to their company owner, or may not understand why normal signup does not create a new workspace.
- Suggested fix: Refine login/signup blocked states for removed members, cross-company membership conflicts, and already-associated emails. Include company-safe guidance without exposing private company details unnecessarily.

### FEAT-P2-008: Add owner transfer for company accounts

- Status: Proposed
- Area: Team accounts / account administration
- Evidence: The MVP intentionally locks each company to one owner. Owners cannot invite another owner, change the owner role, remove themselves, or transfer ownership.
- Impact: If the owner leaves the company or changes responsibilities, support must intervene manually to keep the account administrable.
- Suggested fix: Add an owner-transfer flow that lets the current owner promote an active member to owner and demote themselves to recruiter, with confirmation, audit logging, and guardrails so every company always has exactly one owner.

### FEAT-P2-009: Send internal email notifications for new in-app feedback

- Status: Proposed
- Area: Feedback / support operations
- Evidence: The in-app feedback endpoint stores submissions in `feedback` and `feedback_tags`, and admin replies can be sent back to the company contact through Brevo. There is no email notification when a new feedback item is submitted, so the team must actively check the admin feedback dashboard.
- Impact: Bugs, suggestions, and customer concerns submitted through the built-in feedback tab can sit unnoticed, especially outside regular admin dashboard review.
- Suggested fix: On new feedback submission, send an internal notification email to a configured recipient list such as `FEEDBACK_NOTIFICATION_EMAILS`. Include company name/email, feedback type/category/rating, comment, page URL, tags, and a link to the admin feedback dashboard. Treat notification failure as non-blocking so feedback is still saved.

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
