# Feature Priority List

Living feature tracker for assessment controls, candidate access, reporting, operations, and admin workflows.

This first iteration is based on the requested assessment-link expiry workflow plus a scan of the current web app, API routes, database schema, and analysis/reporting surfaces. Priorities use:

- `P0`: prevents unintended license/quota consumption, blocks live recruiting control, or protects candidate workflow integrity.
- `P1`: materially improves recruiter operations, assessment quality, or supportability for active customers.
- `P2`: improves admin efficiency, reporting depth, observability, or workflow polish after P0/P1.
- `P3`: lower-risk product polish, quality-of-life improvements, and cleanup.

## P0

### FEAT-P0-001: Assessment links should support a start and end validity window

- Status: Proposed
- Area: Assessment access / license control
- Source: Customer request from Yash, 1PharmacyNetwork, on May 5, 2026: recruiting activity had ended, but a student later used the assessment link and consumed a LIC. Requested behavior: set start and end date, and the link is valid only during that interval.
- Evidence: Public application currently fetches and creates sessions through `apps/web/src/app/api/challenges/[id]/apply/route.ts` with no time-window check. The `challenges` table has `is_active` and `created_at`, but no `starts_at` or `ends_at` fields in `database/migrations/001_pg_schema.sql`. The challenge creation and detail UI expose time limit, session limit, allowed emails, and starter files, but no link validity dates.
- Impact: Candidates can start after a campus drive or recruiting window is over, consuming license/quota unexpectedly and creating operational noise for recruiters.
- Suggested fix: Add nullable `starts_at` and `ends_at` columns to `challenges`; expose date/time controls in create/edit/detail screens; enforce the window in both public apply GET/POST and direct session start paths. Show clear candidate-facing states for "not open yet" and "assessment expired"; avoid consuming session quota/license when outside the valid window.

### FEAT-P0-002: Recruiters should be able to pause or close an assessment link

- Status: Proposed
- Area: Assessment access / recruiter control
- Evidence: Schema includes `challenges.is_active`, but public apply GET/POST does not check it in `apps/web/src/app/api/challenges/[id]/apply/route.ts`, and the dashboard detail page has no active/inactive control.
- Impact: Recruiters cannot immediately stop future candidate access without changing code/data manually. This is the manual escape hatch needed alongside date-based expiry.
- Suggested fix: Add an "Open/Closed" control on challenge detail pages, enforce `is_active` in public apply and invite/session-start flows, and display status next to the shareable link.

### FEAT-P0-003: Direct invite links should follow the same access rules as shareable apply links

- Status: Proposed
- Area: Assessment access / consistency
- Evidence: `apps/web/src/app/api/challenges/[id]/invite/route.ts` creates a session directly and does not enforce allowed emails, challenge active state, plan quota, session limit, or any future link validity window. The public apply route enforces allowed emails, session limit, and plan quota.
- Impact: Recruiters/admins may accidentally create usable candidate sessions after an assessment is closed, expired, or at capacity. Candidate access behavior depends on which invitation path was used.
- Suggested fix: Centralize challenge-access validation in a shared helper and call it from public apply, recruiter invite, and session start routes.

## P1

### FEAT-P1-001: Add editable challenge settings after creation

- Status: Proposed
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

### FEAT-P1-003: Add candidate lifecycle controls

- Status: Proposed
- Area: Candidate management / recruiter operations
- Evidence: Candidate rows on the challenge detail page show status and report links, but there are no actions to revoke a pending session, extend time, allow a retry, reset a candidate, or manually mark disqualified/no-show.
- Impact: Real recruiting workflows need exception handling when candidates enter the wrong email, lose access, start accidentally, or require an approved retake.
- Suggested fix: Add recruiter/admin actions with audit logging: revoke pending invite, regenerate link, allow one retry, extend deadline/time limit for a specific candidate, and add candidate notes.

### FEAT-P1-004: Add report export and sharing controls

- Status: Proposed
- Area: Reports / hiring workflow
- Evidence: Analysis reports are rendered in-app under `apps/web/src/app/dashboard/challenges/[id]/submissions/[subId]/page.tsx`, with report components for scores, transcript, workspace, timeline, and evidence. There is no obvious PDF/CSV export, public read-only share link, or hiring-panel handoff workflow.
- Impact: Recruiters often need to share candidate results with hiring managers outside the platform or archive reports in an ATS.
- Suggested fix: Add PDF export, CSV score export per challenge, and optional expiring read-only report links with recruiter-controlled access.

## P2

### FEAT-P2-001: Add assessment-level analytics dashboard

- Status: Proposed
- Area: Analytics / recruiter insight
- Evidence: Challenge detail shows candidate rows and status counts implicitly, while admin has platform cost/usage summaries. There is no per-assessment funnel for invited, started, completed, analyzed, average score, recommendation distribution, no-shows, or time-to-complete.
- Impact: Recruiters cannot quickly understand drive performance or identify weak/strong cohorts without opening reports one by one.
- Suggested fix: Add a challenge analytics panel with completion funnel, score distribution, recommendation breakdown, average duration, assessment-window utilization, and downloadable candidate table.

### FEAT-P2-002: Add assessment template versioning

- Status: Proposed
- Area: Challenge generation / content governance
- Evidence: Challenges store title, description, starter files, role, tech stack, seniority, focus areas, and context directly. Starter files can be edited, and AI generation exists, but there is no version field or immutable snapshot model for template lineage.
- Impact: When challenge content changes over time, recruiters cannot compare cohorts reliably or tell which candidate received which version beyond the stored session workspace snapshot.
- Suggested fix: Add challenge/template versions, record the version on each session, and show version history with diff/restore for description and starter files.

### FEAT-P2-003: Add richer anti-cheating and session integrity signals

- Status: Proposed
- Area: Candidate integrity / reporting
- Evidence: The terminal and interaction logs capture activity, but reports focus on AI collaboration quality. There is no product surface for suspicious idle periods, copy/paste bursts, tab/window focus changes, repeated account/email anomalies, or duplicate workspace signatures.
- Impact: Recruiters may want lightweight integrity flags before relying on scores for high-stakes hiring decisions.
- Suggested fix: Capture and summarize integrity signals separately from score, with conservative labels and evidence so reviewers can inspect rather than blindly reject.

### FEAT-P2-004: Add operational notifications for analysis failures and pending work

- Status: Proposed
- Area: Operations / support
- Evidence: The dashboard polls queued/analyzing sessions, and admin shows pending assessments, but there is no notification workflow when analysis stays queued/analyzing too long or fails.
- Impact: Recruiters may wait for reports without knowing whether intervention is needed.
- Suggested fix: Add admin/recruiter alerts for stuck analysis, failed analysis, and completed-but-not-analyzed sessions; include retry actions and timestamps.

### FEAT-P2-005: Add company-level plan and quota management in admin

- Status: Proposed
- Area: Admin / subscriptions
- Evidence: Plan/quota enforcement exists through enrollment checks, and admin lists companies with plan labels, sessions, costs, and pending counts. There is no visible admin UI for changing a company's plan, extending trial, granting extra assessments, or viewing quota history.
- Impact: Support and sales workflows require database/manual intervention for common customer requests.
- Suggested fix: Add admin controls for plan tier, trial extension, one-off quota grants, period reset, and a quota/audit history table.

## P3

### FEAT-P3-001: Add archived/completed grouping for old assessments

- Status: Proposed
- Area: Dashboard organization
- Evidence: Challenges are listed by creation date and remain visible indefinitely. There is no archive state or folder/grouping model.
- Impact: Recruiter dashboards will become noisy after several campus drives or hiring cycles.
- Suggested fix: Add archive/unarchive, filters for active/closed/archived, and optional tags such as campus, role, cohort, or hiring round.

### FEAT-P3-002: Add copy improvements for candidate-facing unavailable states

- Status: Proposed
- Area: Candidate UX
- Evidence: Current candidate errors include generic messages such as "This challenge link is invalid or no longer available" and "This assessment is temporarily unavailable. Please contact the company."
- Impact: Once expiry, closed links, quotas, and allowlists are all enforced, candidates need clearer guidance without exposing private plan details.
- Suggested fix: Standardize candidate-facing unavailable states: not open yet, expired, closed by recruiter, invite-only, already submitted, at capacity, and temporarily unavailable.

### FEAT-P3-003: Add recruiter notes and decision labels on candidate reports

- Status: Proposed
- Area: Hiring workflow / collaboration
- Evidence: Reports contain generated recommendations, strengths, and areas for growth, but there is no recruiter-owned decision state or notes field on sessions.
- Impact: Teams need a lightweight place to record review decisions without relying on external spreadsheets.
- Suggested fix: Add decision labels such as shortlisted, hold, reject, hired, plus private notes and reviewer attribution.

### FEAT-P3-004: Add challenge duplication

- Status: Proposed
- Area: Dashboard productivity
- Evidence: New challenges can be created manually or from wizard/template flow, but there is no duplicate action on the challenge list/detail page.
- Impact: Similar campus drives or role variants require repetitive setup.
- Suggested fix: Add "Duplicate challenge" that copies title, description, starter files, allowed emails optionally, role metadata, session limits, and access-window defaults.
