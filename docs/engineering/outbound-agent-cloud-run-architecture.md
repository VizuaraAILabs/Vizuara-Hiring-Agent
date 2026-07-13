# Outbound Agent Cloud Run Architecture

Target architecture for adding agentic outbound discovery, enrichment, outreach drafting, and admin-controlled sending to ArcEval.

ArcEval remains the control plane and source of truth. A separate simple Cloud Run HTTP service runs Claude Code for bounded outbound missions. The Cloud Run service is not a Cloud Run Job and is not the database of record. It receives run requests from ArcEval, executes agent work with controlled tools, and returns structured results back to ArcEval for admin review.

## Product Goal

ArcEval should have an admin-controlled outbound system that can:

- Discover companies that are likely ArcEval buyers.
- Explain exactly why each company was identified.
- Enrich approved companies with firmographic data and relevant contacts.
- Draft highly personalized outreach emails and manual LinkedIn messages.
- Let an admin review, edit, approve, send, suppress, or reject every action.
- Track replies, follow-ups, outcomes, and learning signals over time.

The system should feel agentic because Claude Code performs bounded research and reasoning loops, but ArcEval remains the authority for state, approval, and sending.

## Target Customer Definition

`ICP` means Ideal Customer Profile.

For ArcEval, the starting ICP is:

- Companies hiring software, AI, ML, data, platform, or technical product roles.
- Companies with evidence of hiring-volume pain, low-signal interviews, AI-assisted candidate concerns, or changes in technical hiring due to AI.
- Teams where evaluating real AI-native work matters more than resumes, trivia, or LeetCode-style filtering.
- Likely buyers or influencers: founders, CTOs, VPs of Engineering, Heads of Talent, recruiting operations, and technical hiring managers.

The system should keep ICP settings editable from ArcEval because the best market segment will change as outreach data comes in.

## Boundaries

Included in this architecture:

- Agentic discovery.
- Evidence capture.
- Prospect review.
- Enrichment.
- Contact discovery and verification.
- Personalized draft generation.
- Admin edit/approve/send workflow.
- LinkedIn manual outreach tasks.
- Reply/follow-up classification.
- Observability and auditability.

Not included in this architecture:

- Prospect-specific outbound landing pages. This remains deferred as `FEAT-P3-005` in `docs/product/feature-priority-list.md`.
- Automated LinkedIn scraping.
- Automated LinkedIn DM sending without official approved API access.
- Fully autonomous outbound sending without admin approval.
- Direct database writes from the Cloud Run service to ArcEval Postgres.

## High-Level Architecture

```text
ArcEval VM / apps/web
  - Admin UI
  - Postgres source of truth
  - Run creation and run status
  - Prospect, evidence, contact, draft, message, suppression storage
  - Admin approvals
  - Email sending
  - Reply/follow-up tracking

Cloud Run / arceval-outbound-agent
  - Simple HTTP service
  - Runs Claude Code for bounded outbound missions
  - Uses controlled connector scripts/tools
  - Returns structured results to ArcEval for storage and review
```

ArcEval owns durable state. Cloud Run owns temporary execution.

## Deployment Shape

Add a service to the current repo:

```text
services/outbound-agent/
  package.json
  tsconfig.json
  src/
    server.ts
    auth.ts
    claude-runner.ts
    schemas.ts
    prompts/
      discovery.md
      enrichment.md
      outreach-draft.md
      reply-classifier.md

docker/Dockerfile.outbound-agent
```

Deploy as one Cloud Run service:

```text
arceval-outbound-agent
```

The service listens on `$PORT`. It is deployed separately from the ArcEval VM and is not added to production `docker-compose.yml`.

## Configuration

Keep environment variables small and service-level.

Required:

```text
ANTHROPIC_API_KEY
ARCEVAL_AGENT_SECRET
```

Optional Cloud Run runner controls:

```text
OUTBOUND_AGENT_USE_MOCK=true
```

Add provider keys only when a connector is implemented:

```text
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
APOLLO_API_KEY
HUNTER_API_KEY
EMAIL_VERIFICATION_API_KEY
```

Default for the first build: do not configure a dedicated search provider. Let Claude Code use its native web-search capability for discovery. Dedicated search providers can be added later if quality, repeatability, cost, or observability require it.

Do not create per-run environment variables. Run-specific configuration lives in ArcEval and is passed in request bodies or fetched by `runId`.

## Runtime Model

The default first implementation keeps runs bounded and request-scoped.

1. Admin starts a run in ArcEval.
2. ArcEval creates an `outbound_agent_runs` row.
3. ArcEval calls Cloud Run `POST /runs`.
4. Cloud Run runs the bounded task and returns the result or a validation failure.
5. ArcEval stores accepted output.

This is simpler to deploy and debug. Each discovery run should be capped by runtime and prospect count so it comfortably fits inside a Cloud Run request.

The target system can move to async progress once runs need it:

1. Admin starts a run in ArcEval.
2. ArcEval creates an `outbound_agent_runs` row.
3. ArcEval calls Cloud Run `POST /runs`.
4. Cloud Run acknowledges the run and starts bounded work.
5. Cloud Run sends heartbeats and partial/final results to ArcEval.
6. ArcEval shows progress and stores accepted output.

If async progress is added, Cloud Run should be configured for background execution if it returns before a run completes:

- CPU always allocated, or
- request kept open until the run is complete.

The upgrade path is background execution with ArcEval heartbeats and stale-run retry logic. If a Cloud Run instance dies, ArcEval marks the run stale and lets the admin retry. This avoids Cloud Run Jobs while keeping run control inside ArcEval.

## Cloud Run Service API

### `POST /runs`

Starts an outbound run.

Request:

```json
{
  "runId": "run_123",
  "mode": "discovery",
  "config": {
    "maxProspects": 10
  }
}
```

ArcEval sends the run config in the request body for the first implementation. Cloud Run can fetch by `runId` later if the request body becomes too large.

Response:

```json
{
  "runId": "run_123",
  "status": "completed",
  "result": {
    "prospects": [],
    "rejected": []
  }
}
```

Supported modes:

- `discovery`
- `enrichment`
- `draft_outreach`
- `reply_classification`

### `GET /runs/:runId`

Returns best-effort local status for currently active runs.

ArcEval remains the durable source of truth, so this endpoint is operational convenience only.

### `POST /runs/:runId/cancel`

Requests local cancellation. The service should also check ArcEval for cancellation status during long runs.

### `GET /health`

Returns service health.

```json
{
  "ok": true,
  "service": "arceval-outbound-agent",
  "version": "0.1.0"
}
```

## ArcEval API Routes

Add admin routes:

```text
apps/web/src/app/api/admin/outbound/runs/route.ts
apps/web/src/app/api/admin/outbound/prospects/[prospectId]/route.ts
apps/web/src/app/api/admin/outbound/prospects/[prospectId]/enrich/route.ts
apps/web/src/app/api/admin/outbound/prospects/[prospectId]/drafts/route.ts
apps/web/src/app/api/admin/outbound/drafts/[draftId]/route.ts
apps/web/src/app/api/admin/outbound/drafts/[draftId]/send/route.ts
```

All admin routes use existing ArcEval admin auth through `getAuthUser()` and `isAdmin(...)`.

Later phases can add focused routes for suppression and optional asynchronous callbacks.

## Admin UI

Add:

```text
apps/web/src/app/dashboard/admin/outbound/page.tsx
```

Sections:

- `Runs`: active and historical runs, status, config, logs, errors, output counts.
- `Prospects`: discovered companies, fit score, status, signal tags, review actions.
- `Evidence`: source links, signal type, quotes/snippets, confidence, source date.
- `Contacts`: enriched people, titles, emails, email confidence, LinkedIn URLs where compliant.
- `Drafts`: generated emails and manual LinkedIn messages, edit and approval workflow.
- `Messages`: sent emails, manual LinkedIn actions, bounces, replies, follow-ups.
- `Suppression`: do-not-contact domains/emails/company names.
- `Settings`: ICP profile, sources, daily caps, region filters, excluded companies.

Admin controls:

- Start discovery.
- Cancel a run.
- Approve/reject/disqualify prospects.
- Request enrichment.
- Request draft generation.
- Edit drafts.
- Approve and send email.
- Copy LinkedIn manual message and mark sent.
- Add suppression rules.
- Retry failed runs.

## Database Model

Use ArcEval Postgres as the source of truth.

Keep the durable schema intentionally lean. A field should be a first-class column only when ArcEval needs to filter, join, approve, send, suppress, or audit on it. Provider-specific details, model names, prompt versions, firmographic extras, reply snippets, and debugging detail should live in `JSONB` until they prove they need indexes or dedicated UI filters.

### `outbound_agent_runs`

Tracks every run.

Columns:

- `id UUID PRIMARY KEY`
- `mode TEXT NOT NULL`
- `status TEXT NOT NULL`
- `config JSONB NOT NULL`
- `started_by_email TEXT`
- `started_at TIMESTAMPTZ`
- `last_heartbeat_at TIMESTAMPTZ`
- `completed_at TIMESTAMPTZ`
- `error TEXT`
- `stats JSONB`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Statuses:

- `queued`
- `accepted`
- `running`
- `completed`
- `failed`
- `canceled`
- `stale`

### `outbound_prospects`

Company-level prospect record.

Columns:

- `id UUID PRIMARY KEY`
- `company_name TEXT NOT NULL`
- `domain TEXT`
- `status TEXT NOT NULL`
- `fit_score INTEGER`
- `score_reasons JSONB`
- `signals TEXT[]`
- `source_run_id UUID REFERENCES outbound_agent_runs(id)`
- `reviewed_by_email TEXT`
- `reviewed_at TIMESTAMPTZ`
- `metadata JSONB`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Statuses:

- `new`
- `reviewed`
- `approved`
- `rejected`
- `enrichment_requested`
- `enriched`
- `draft_requested`
- `drafted`
- `contacted`
- `replied`
- `disqualified`
- `suppressed`

Unique indexes:

- `lower(domain)` where domain is not null
- `lower(company_name)` where domain is null

### `outbound_evidence`

Stores why a prospect was identified.

Columns:

- `id UUID PRIMARY KEY`
- `prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE`
- `run_id UUID REFERENCES outbound_agent_runs(id)`
- `source_type TEXT NOT NULL`
- `source_url TEXT NOT NULL`
- `signal_type TEXT NOT NULL`
- `summary TEXT NOT NULL`
- `quoted_text TEXT`
- `confidence INTEGER`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Source types:

- `web`
- `news`
- `reddit`
- `hacker_news`
- `ats`
- `manual`
- `linkedin_manual`

Signal types:

- `active_engineering_hiring`
- `ai_hiring_change`
- `hiring_pipeline_pain`
- `technical_assessment_fit`
- `funding_or_growth`
- `manual_signal`

### `outbound_contacts`

People to contact.

Columns:

- `id UUID PRIMARY KEY`
- `prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE`
- `full_name TEXT`
- `role_title TEXT`
- `email TEXT`
- `email_status TEXT`
- `linkedin_url TEXT`
- `source TEXT`
- `confidence INTEGER`
- `metadata JSONB`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Email statuses:

- `unknown`
- `guessed`
- `verified`
- `invalid`
- `risky`

### `outbound_drafts`

Reviewable message drafts.

Columns:

- `id UUID PRIMARY KEY`
- `prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE`
- `contact_id UUID REFERENCES outbound_contacts(id)`
- `run_id UUID REFERENCES outbound_agent_runs(id)`
- `channel TEXT NOT NULL`
- `sequence_step INTEGER DEFAULT 1`
- `subject TEXT`
- `body TEXT NOT NULL`
- `personalization_basis JSONB NOT NULL`
- `status TEXT NOT NULL`
- `approved_by_email TEXT`
- `approved_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Channels:

- `email`
- `linkedin_manual`

Statuses:

- `draft`
- `edited`
- `approved`
- `sent`
- `rejected`

### `outbound_messages`

Messages that were sent or manually marked sent.

Columns:

- `id UUID PRIMARY KEY`
- `draft_id UUID REFERENCES outbound_drafts(id)`
- `prospect_id UUID NOT NULL REFERENCES outbound_prospects(id)`
- `contact_id UUID REFERENCES outbound_contacts(id)`
- `channel TEXT NOT NULL`
- `provider TEXT`
- `provider_message_id TEXT`
- `status TEXT NOT NULL`
- `sent_by_email TEXT`
- `sent_at TIMESTAMPTZ`
- `metadata JSONB`

Statuses:

- `sent`
- `failed`
- `manual_sent`
- `opened`
- `clicked`
- `reply_received`
- `bounced`
- `unsubscribed`

Reply classification, open/click events, provider payloads, and follow-up suggestions can live in `metadata` until ArcEval needs a dedicated event timeline. This avoids a separate reply-events table before there is product pressure for it.

### `outbound_suppression`

Do-not-contact guardrails.

Columns:

- `id UUID PRIMARY KEY`
- `type TEXT NOT NULL`
- `value TEXT NOT NULL`
- `reason TEXT`
- `created_by_email TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Types:

- `domain`
- `email`
- `company_name`

## Discovery Agent

Discovery finds companies, not individual contacts.

### Discovery Signals

`active_engineering_hiring`

- Multiple open engineering, AI, ML, data, platform, or developer-tooling roles.
- Recent ATS activity.
- Hiring surge after funding or product launch.

`ai_hiring_change`

- Public mention that AI changed interviews, take-homes, screening, or candidate evaluation.
- Mention of ChatGPT, AI coding tools, AI-assisted candidates, or new technical assessment practices.

`hiring_pipeline_pain`

- Public mention of too many applicants, noisy pipelines, low-signal screens, candidate cheating, AI-generated submissions, or difficulty evaluating skill.

`technical_assessment_fit`

- Company hires for roles where ArcEval's AI-assisted coding/work-sample assessment is relevant.

### Discovery Sources

Default first source:

- Claude Code native web search. Every accepted prospect still needs source URLs and evidence stored in ArcEval.

Target sources over time:

- News search.
- Company blogs.
- Public career pages.
- ATS pages: Greenhouse, Lever, Ashby, Workable, SmartRecruiters.
- Reddit API.
- Hacker News search/API.
- Public podcasts/newsletters/transcripts where companies discuss hiring.
- Manual CSV import from Sales Navigator, Apollo, events, conferences, or founder-curated lead lists.

Dedicated web-search providers remain alternatives if native search is not enough:

- Tavily or Exa for agentic research workflows.
- SerpAPI for Google-like search result coverage.
- Bing, Brave, or Google Programmable Search for direct web-search APIs.

LinkedIn policy:

- Do not scrape LinkedIn pages.
- Do not automate LinkedIn DMs.
- Allow manual import of LinkedIn or Sales Navigator exports if obtained through allowed workflows.
- Generate LinkedIn connection notes and DM drafts for manual use.
- Store LinkedIn company/contact URLs only when supplied by a compliant source or manual entry.

### Discovery Output Contract

Claude Code must return structured JSON:

```json
{
  "prospects": [
    {
      "companyName": "Example AI",
      "domain": "example.ai",
      "industry": "B2B SaaS",
      "region": "US",
      "employeeCountEstimate": "100-500",
      "fitScore": 84,
      "signals": ["active_engineering_hiring", "ai_hiring_change"],
      "scoreReasons": [
        "Multiple open ML and backend roles",
        "Public post mentions changing interviews because of AI-assisted candidates"
      ],
      "evidence": [
        {
          "sourceType": "ats",
          "sourceUrl": "https://example.ai/careers",
          "signalType": "active_engineering_hiring",
          "summary": "Company lists eight engineering roles including ML infrastructure.",
          "quotedText": "Senior ML Infrastructure Engineer",
          "confidence": 85
        }
      ],
      "recommendedNextStep": "review_for_enrichment"
    }
  ],
  "rejected": [
    {
      "companyName": "Weak Fit Co",
      "reason": "Hiring signal found, but no AI hiring pain or technical assessment fit."
    }
  ]
}
```

ArcEval validates the JSON before storing.

## Scoring

Each prospect gets a 0-100 `fit_score`.

Suggested baseline:

- `+25`: active hiring for engineering, AI, data, ML, or developer roles.
- `+25`: explicit AI hiring/interview pain.
- `+15`: company size fits current ArcEval sales motion.
- `+10`: reachable talent or engineering leader found.
- `+10`: clear technical assessment fit.
- `+10`: signal is recent.
- `-20`: already contacted recently.
- `-30`: weak evidence or no public source.
- `-100`: suppressed, existing customer, or do-not-contact.

The score should always include visible reasons.

## Enrichment Agent

Enrichment runs only after admin approval.

Inputs:

- company name
- domain
- evidence
- desired contact roles

Desired contacts:

- Founder
- CTO
- VP Engineering
- Head of Engineering
- Head of Talent
- Talent Acquisition Lead
- Recruiting Operations
- Engineering Manager for AI/data/platform teams

Enrichment should:

- Confirm domain and company identity.
- Resolve company size, industry, region, and hiring context.
- Find relevant contacts.
- Find work emails through public company sources, admin-imported lists, or approved enrichment providers.
- Verify emails where possible. In the first version, mark uncertain emails as `unknown` or `guessed`; do not pretend they are verified.
- Dedupe against existing customers, prior outbound, and suppression lists.
- Avoid personal emails unless explicitly approved and legally appropriate.

Default first enrichment approach:

- Use Claude Code web research plus public company pages and manual imports.
- Store contact confidence explicitly.
- Do not require Apollo/Hunter/People Data Labs to ship the first version.

Enrichment provider alternatives:

- Apollo for outbound-sales contact discovery.
- Hunter for domain email discovery and verification.
- People Data Labs or Clearbit for firmographic/company enrichment.
- Clay-style workflows if the team wants multi-provider waterfalls later.

Email verification alternatives:

- Provider-bundled verification when using Apollo or Hunter.
- NeverBounce, ZeroBounce, Kickbox, or similar tools if bounce risk becomes a problem.

Output:

```json
{
  "company": {
    "domain": "example.ai",
    "employeeCountEstimate": "100-500",
    "industry": "AI infrastructure",
    "region": "US"
  },
  "contacts": [
    {
      "fullName": "Jane Doe",
      "roleTitle": "Head of Talent",
      "department": "Talent",
      "email": "jane@example.ai",
      "emailStatus": "verified",
      "linkedinUrl": "https://...",
      "source": "provider",
      "confidence": 90
    }
  ]
}
```

## Drafting Agent

Drafting runs after enrichment.

It creates:

- first cold email
- follow-up 1
- follow-up 2
- LinkedIn connection note for manual use
- LinkedIn DM draft for manual use after connection

Every draft must include `personalization_basis`:

```json
{
  "evidenceIds": ["evidence_1", "evidence_2"],
  "reasoning": [
    "The email references active AI engineering hiring because the careers page lists six relevant roles.",
    "The email references AI hiring change because the CTO blog post discusses changing interviews after ChatGPT."
  ]
}
```

Drafting rules:

- No fake familiarity.
- No unsupported claims.
- No exaggerated urgency.
- No private or sensitive inferences.
- Mention evidence only when backed by stored sources.
- Keep emails short and specific.
- One CTA.
- Include unsubscribe/suppression support in the sending layer.

Example positioning:

```text
I noticed your team is hiring across engineering and has been discussing how AI is changing candidate evaluation. ArcEval is built for that exact shift: candidates work in a real AI-assisted coding environment, and your team gets evidence on how they reason, prompt, debug, and ship.
```

## Sending And Review

Claude Code does not send emails.

Default sending path:

- Use ArcEval's existing Brevo integration for admin-approved outbound email.
- Start with a conservative cap of 10 approved cold sends per day.
- Require suppression checks before every send.
- Revisit a dedicated outbound deliverability platform only after early reply/bounce quality is known.

ArcEval sends only after admin approval:

1. Agent drafts.
2. Admin reviews and edits.
3. Admin approves.
4. ArcEval checks suppression and existing customer status.
5. ArcEval sends through the configured email provider.
6. ArcEval records `outbound_messages`.
7. Reply/bounce/unsubscribe events update prospect/contact status.

LinkedIn flow:

1. Agent drafts connection note or DM.
2. Admin opens LinkedIn manually.
3. Admin copies or edits message.
4. Admin marks `manual_sent`.

Dedicated outbound tool alternatives:

- Smartlead, Instantly, Lemlist, or similar tools if cold outbound volume grows and needs warmup, inbox rotation, sequence analytics, and stronger deliverability controls.
- Google Workspace/Gmail API for very low-volume founder-led outreach.
- Resend/Postmark only for carefully controlled product/transactional-style email, not high-volume cold outreach.

## Reply Classification

Inbound replies should be classified by the outbound agent or ArcEval server-side LLM route.

Classify into:

- interested
- not now
- wrong person
- unsubscribe
- objection
- meeting requested
- negative
- auto reply
- unknown

The classifier should suggest next action:

- book meeting
- send answer
- follow up later
- ask for referral
- suppress contact
- suppress domain

Admin approval is required before sending any reply that is not purely operational.

## Claude Code Runtime

The Cloud Run service invokes Claude Code non-interactively for bounded tasks.

Runner behavior:

- Create a temporary workspace per run under `/tmp/arceval-outbound/<runId>`.
- Write prompt, input JSON, and schemas into the workspace.
- Provide only approved connector scripts and secrets.
- Run Claude Code with strict instructions and required JSON output.
- Capture stdout, stderr, exit code, execution time, and artifacts.
- Validate final JSON against schemas.
- Return validation errors to ArcEval instead of storing malformed output.

Claude Code should orchestrate controlled tools. Raw connector calls should be implemented in code so runs are traceable and rate-limited.

## Prompt Boundaries

Prompts must state:

- This is B2B prospect research for ArcEval.
- Use public and compliant sources.
- Cite evidence for every prospect.
- Do not scrape LinkedIn.
- Do not automate LinkedIn activity.
- Return only JSON matching the schema.
- Prefer fewer high-confidence prospects over many weak ones.
- Reject prospects with no clear evidence.
- Never send messages.

## Run Lifecycle

```text
1. Admin starts discovery in ArcEval.
2. ArcEval creates outbound_agent_runs row.
3. ArcEval calls Cloud Run POST /runs with mode=discovery.
4. Cloud Run acknowledges and starts Claude Code.
5. Cloud Run sends heartbeats to ArcEval.
6. Cloud Run posts discovered prospects/evidence to ArcEval.
7. ArcEval validates and stores prospects/evidence.
8. Admin reviews prospects.
9. Admin approves selected prospects for enrichment.
10. ArcEval calls Cloud Run POST /runs with mode=enrichment.
11. Cloud Run enriches company/contact data and returns results.
12. Admin reviews enriched contacts.
13. Admin requests drafts.
14. ArcEval calls Cloud Run POST /runs with mode=draft_outreach.
15. Cloud Run drafts email and LinkedIn-manual messages.
16. Admin edits/approves/sends emails or manually handles LinkedIn.
17. Replies are classified and turned into suggested next actions.
```

## Observability

ArcEval should show:

- run status
- run mode
- source list
- ICP settings
- prompt version
- model / Claude Code command version
- started/completed timestamps
- heartbeat timestamp
- prospects found
- prospects accepted/rejected
- enrichment and drafting counts
- validation failures
- connector errors
- approximate cost if available

Cloud Run logs should include:

- run id
- mode
- high-level stage
- connector call counts
- validation status
- no secrets

## Safety And Compliance

- Admin approval is mandatory before sending.
- Suppression list is checked before drafting and before sending.
- Existing ArcEval customers are excluded by domain/email.
- LinkedIn activity is manual unless official API access permits otherwise.
- Every claim in an email must trace back to stored evidence.
- Do not store unnecessary personal data.
- Prefer company/work contact data over personal data.
- Keep all raw agent output auditable for admin review.
- Rate-limit provider calls.
- Respect provider terms and robots/API access rules.

## Implementation Phases

### Phase 1: Foundation

- Add outbound database migration.
- Add Cloud Run service skeleton with `/health`, auth, and `/runs`.
- Add admin page shell with runs table.
- Add mocked discovery output end-to-end.

### Phase 2: Agentic Discovery

- Add discovery prompt and schema.
- Add Claude Code runner.
- Use Claude Code native web search for the first discovery pass.
- Add dedicated ATS/search connectors only when native search is not enough.
- Store prospects and evidence.
- Add prospect review UI.

### Phase 3: Enrichment

- Add enrichment schema and prompt.
- Use Claude Code web research, public company pages, and manual imports for the first enrichment pass.
- Mark unverified emails as `unknown` or `guessed`.
- Add provider-backed contact enrichment and email verification only after the manual/public loop proves useful.
- Add contact review UI.

### Phase 4: Drafting

- Add outreach draft prompt and schema.
- Generate email sequence and LinkedIn manual drafts.
- Add draft review/edit/approve UI.

### Phase 5: Sending

- Add approved email send path through the existing Brevo helpers.
- Add message records and send status.
- Add suppression checks.
- Enforce an initial 10-approved-sends-per-day cap.
- Add manual LinkedIn task workflow.

### Phase 6: Reply And Learning Loop

- Add reply event ingestion.
- Add reply classifier.
- Add follow-up suggestions.
- Feed reply/conversion outcomes back into scoring and ICP settings.

### Phase 7: Scheduling And Scale

- Add scheduled discovery runs.
- Add per-source rate limits and daily caps.
- Add stale-run retry.
- Add cost dashboard.

## Defaults And Alternatives

Use these defaults until the data says otherwise:

- Web search: Claude Code native web search.
- Enrichment: Claude Code web research, public company pages, and manual imports.
- Email verification: no dedicated provider at first; store uncertain emails as `unknown` or `guessed`.
- Sending: existing ArcEval Brevo helpers.
- Daily send cap: 10 admin-approved cold emails per day.
- Cloud Run execution: keep runs bounded and request-scoped first.

Alternatives to revisit:

- Web search: Tavily, Exa, SerpAPI, Bing, Brave, or Google Programmable Search.
- Enrichment: Apollo, Hunter, People Data Labs, Clearbit, or Clay-style waterfalls.
- Email verification: Hunter, NeverBounce, ZeroBounce, Kickbox, or provider-bundled checks.
- Sending: Smartlead, Instantly, Lemlist, Google Workspace/Gmail API, or another dedicated outbound setup.
- Cloud Run execution: always-allocated CPU with background runs, heartbeats, and stale-run retry.
