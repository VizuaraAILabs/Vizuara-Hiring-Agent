# Environment Variables

All variables go in `.env.production` at the project root. The deploy script (`scripts/deploy.sh`) sources this file before running.

## Infrastructure

| Variable | Value | Notes |
|---|---|---|
| `DOMAIN` | `hire.vizuara.ai` | Used by Caddy and for building public URLs |
| `POSTGRES_PASSWORD` | *(set in environment)* | PostgreSQL password |
| `NODE_ENV` | `production` | Set automatically in docker-compose |

## API Keys

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | *(set in environment)* | Challenge generation + analysis engine |
| `ANTHROPIC_API_KEY` | *(set in environment)* | Terminal server AI features |

## Firebase (NEW - required)

| Variable | Value | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` | *(fill in)* | Firebase console > Project Settings > General |
| `FIREBASE_CLIENT_EMAIL` | *(fill in)* | Firebase console > Project Settings > Service Accounts > Generate key |
| `FIREBASE_PRIVATE_KEY` | *(fill in)* | From the same service account JSON key file. Wrap in double quotes to preserve newlines |

## Auth & Session

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_VIZUARA_URL` | `https://vizuara.ai` | Vizuara base URL for login/signup redirects |
| `NEXT_PUBLIC_APP_CALLBACK_URL` | `https://hire.vizuara.ai/api/auth/session` | OAuth callback URL after Vizuara login |
| `COOKIE_DOMAIN` | *(unset)* | Set to `.vizuara.ai` if you need cross-subdomain cookies |
| `ARCEVAL_ENROLLMENT_ID` | *(empty)* | Vizuara course ID for subscription gating |

## Derived (set automatically in docker-compose)

These are constructed from the variables above in `docker-compose.yml` and do not need to be set manually:

- `DATABASE_URL` - built from `POSTGRES_PASSWORD`
- `NEXT_PUBLIC_TERMINAL_WS_URL` - built from `DOMAIN`
- `NEXT_PUBLIC_TERMINAL_HTTP_URL` - built from `DOMAIN`
- `ANALYSIS_ENGINE_URL` - hardcoded to `http://analysis:8000`

## Removed

| Variable | Reason |
|---|---|
| `JWT_SECRET` | Replaced by Firebase session cookies |
