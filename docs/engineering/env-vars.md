# Environment Variables

All variables go in `.env.production` at the project root. Start from `.env.example`, replace the placeholder values, and keep real secrets out of git. The deploy script (`scripts/deploy.sh`) passes this file to Docker Compose.

## Infrastructure

| Variable | Value | Notes |
|---|---|---|
| `DOMAIN` | `hire.vizuara.ai` | Used by Caddy and for building public URLs, including assessment/team invite links in emails (`https://${DOMAIN}/...`). Must be set for the web service or emailed links fall back to the server's request origin |
| `DATABASE_URL` | *(set in environment)* | Postgres connection string used by web, terminal, analysis, migrations |
| `NODE_ENV` | `production` | Set automatically in docker-compose |

## API Keys

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | *(set in environment)* | Challenge generation + analysis engine |
| `ANTHROPIC_API_KEY` | *(set in environment)* | Terminal-server Claude gateway only. Never passed to candidate sandboxes |
| `CLAUDE_GATEWAY_TOKEN_SECRET` | *(set in environment)* | Long random secret used to hash session-scoped Claude gateway tokens |
| `CANDIDATE_ANALYSIS_API_KEY` | *(set in environment)* | Bearer key for `/api/public/candidate-analysis` |
| `BREVO_API_KEY` | *(set in environment)* | Invite and trial email delivery |
| `CRON_SECRET` | *(set in environment)* | Bearer secret for scheduled email endpoints |

## Firebase (NEW - required)

| Variable | Value | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` | *(fill in)* | Firebase console > Project Settings > General |
| `FIREBASE_CLIENT_EMAIL` | *(fill in)* | Firebase console > Project Settings > Service Accounts > Generate key |
| `FIREBASE_PRIVATE_KEY` | *(fill in)* | From the same service account JSON key file. Wrap in double quotes to preserve newlines |

## Firebase Client Auth

Required for local email/password login in the web app.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | *(fill in)* | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | *(fill in)* | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | *(fill in)* | Must match the server-side Firebase project |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | *(fill in)* | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | *(fill in)* | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | *(fill in)* | Firebase web app config |

## Auth & Session

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_VIZUARA_URL` | `https://vizuara.ai` | Vizuara base URL for login/signup redirects |
| `NEXT_PUBLIC_APP_CALLBACK_URL` | `https://hire.vizuara.ai/api/auth/session` | OAuth callback URL after Vizuara login |
| `COOKIE_DOMAIN` | *(unset)* | Set to `.vizuara.ai` if you need cross-subdomain cookies |
| `ARCEVAL_ENROLLMENT_ID` | *(empty)* | Vizuara course ID for subscription gating |
| `ARCEVAL_PAYMENT_URL` | *(empty)* | Optional payment URL used by subscription checks |
| `ARCEVAL_PLAN_STATUS_URL` | `https://us-central1-vizuara-ai-labs.cloudfunctions.net/getEffectivePlanForArcEval` | Labs function used to resolve ArcEval paid plan tier and billing period |

## Analysis Engine

| Variable | Default | Notes |
|---|---|---|
| `ANALYSIS_MAX_CONCURRENT` | `2` | Number of background analysis workers |
| `ANALYSIS_QUEUE_POLL_SECONDS` | `2` | Poll interval when no analysis job is available |
| `ANALYSIS_JOB_LEASE_SECONDS` | `300` | Durable queue lease/heartbeat window |
| `ANALYSIS_DB_CONNECT_TIMEOUT_SECONDS` | `10` | Timeout for opening analysis-engine DB connections |
| `ANALYSIS_DB_COMMAND_TIMEOUT_SECONDS` | `30` | Default timeout for analysis-engine DB commands |
| `ANALYSIS_DB_CLOSE_TIMEOUT_SECONDS` | `10` | Graceful shutdown timeout before terminating DB connections |
| `GEMINI_REQUEST_TIMEOUT_MS` | `60000` | Hard timeout for each Gemini HTTP request |
| `ANALYSIS_SESSION_TIMEOUT_SECONDS` | `240` | Total deadline for full two-pass analysis |
| `ANALYSIS_ENRICHMENT_TIMEOUT_SECONDS` | `75` | Deadline for dimension enrichment |
| `ANALYSIS_NARRATIVE_TIMEOUT_SECONDS` | `105` | Deadline for transcript narrative generation |
| `ANALYSIS_CHUNK_TRANSCRIPT_CHARS` | `160000` | Transcript size that triggers chunked observation extraction |
| `ANALYSIS_CHUNK_TARGET_CHARS` | `100000` | Target maximum characters per observation-extraction chunk |
| `ANALYSIS_MAX_PASS1_CHUNKS` | `12` | Maximum transcript chunks analyzed in Pass 1 for extremely large sessions |
| `ANALYSIS_MAX_CANDIDATE_ACTIONS_FOR_SCORING` | `250` | Maximum candidate-action observations kept for final scoring after chunk merging |
| `ANALYSIS_MAX_AI_OBSERVATIONS_FOR_SCORING` | `300` | Maximum AI-response observations kept for final scoring after chunk merging |
| `ANALYSIS_MAX_SCORING_OBSERVATIONS_CHARS` | `120000` | Maximum merged-observation JSON size sent into final scoring |

## Outbound Agent

| Variable | Default | Notes |
|---|---|---|
| `OUTBOUND_AGENT_URL` | *(empty)* | Optional Cloud Run service URL for `arceval-outbound-agent`. When empty, Phase 1 discovery uses the local mock result |
| `ARCEVAL_AGENT_SECRET` | *(empty)* | Shared bearer secret used between ArcEval and the Cloud Run outbound agent. Set the same value on both services before enabling `OUTBOUND_AGENT_URL` |

## Terminal/Sandbox

| Variable | Default | Notes |
|---|---|---|
| `NEXT_APP_URL` | `http://web:3000` in Docker | Internal URL the terminal service uses to call web APIs |
| `SANDBOX_MAX_CONCURRENT` | `5` | Maximum live sandbox containers |
| `SANDBOX_IDLE_TTL_MS` | `900000` in Docker | Idle sandbox cleanup threshold |
| `SANDBOX_QUEUE_TIMEOUT_MS` | `60000` | How long a session can wait for sandbox capacity |

## Derived (set automatically in docker-compose)

These are constructed from the variables above in `docker-compose.yml` and do not need to be set manually:

- `NEXT_PUBLIC_TERMINAL_WS_URL` - built from `DOMAIN`
- `NEXT_PUBLIC_TERMINAL_HTTP_URL` - built from `DOMAIN`
- `CLAUDE_GATEWAY_BASE_URL` - built from `DOMAIN`
- `ANALYSIS_ENGINE_URL` - hardcoded to `http://analysis:8000`

## Removed

| Variable | Reason |
|---|---|
| `JWT_SECRET` | Replaced by Firebase session cookies |
