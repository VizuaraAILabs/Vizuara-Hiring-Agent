# Claude Code Gateway Implementation Plan

## Summary

Add a minimal Anthropic-compatible gateway so Claude Code can run in candidate sandboxes without exposing `ANTHROPIC_API_KEY`. The sandbox will receive only `ANTHROPIC_BASE_URL` and a session-scoped `ANTHROPIC_AUTH_TOKEN`. Cost tracking stays unchanged for now.

## Key Changes

- Add gateway environment variables to trusted services only:
  - `ANTHROPIC_API_KEY`: real Anthropic key, used only by the terminal gateway.
  - `CLAUDE_GATEWAY_BASE_URL`: `https://${DOMAIN}/claude-gateway`.
  - `CLAUDE_GATEWAY_TOKEN_SECRET`: server-only secret for hashing opaque session tokens.
- Keep Claude Code pinned to Haiku 4.5:
  - `SANDBOX_CLAUDE_MODEL=claude-haiku-4-5-20251001`
  - Candidates must not be able to select or override a different model.
- Route gateway traffic through Caddy:
  - `/claude-gateway*` -> `terminal:3001`
  - Reason: candidate sandboxes currently run on Docker bridge networking, so the public app domain is the smallest reliable route without Docker network/DNS changes.
- Keep current PTY-based cost tracking unchanged.
  - No budget caps.
  - No new usage table.
  - No `429` budget enforcement.

## Database Changes

Add migration `020_claude_gateway_tokens.sql`.

Create `claude_gateway_tokens`:

```sql
CREATE TABLE IF NOT EXISTS claude_gateway_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claude_gateway_tokens_session
  ON claude_gateway_tokens(session_id);

CREATE INDEX IF NOT EXISTS idx_claude_gateway_tokens_expires
  ON claude_gateway_tokens(expires_at);
```

Reasoning:

- Store only hashed gateway tokens, never raw bearer tokens.
- Tie each token to exactly one candidate session.
- Allow immediate revocation by setting `revoked_at`.
- Keep expiry queryable for validation and later cleanup.

## Terminal Server Changes

- Before spawning a sandbox, generate a fresh opaque Claude gateway token for the `session_id`.
- Revoke any previous gateway token for the same session.
- Set token expiry to:

```text
session started/current spawn time + challenge.time_limit_min + 30 minutes
```

- Pass these Claude-related environment variables into both container creation and candidate shell exec:

```text
ANTHROPIC_BASE_URL=${CLAUDE_GATEWAY_BASE_URL}
ANTHROPIC_AUTH_TOKEN=<raw session token>
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

- Do not pass `ANTHROPIC_API_KEY` into the sandbox.

Reasoning:

- The real Anthropic key stays in a trusted service.
- The visible sandbox token is scoped, short-lived, revocable, and useless outside the gateway.
- The existing Claude Code wrapper can stay; Claude Code should use `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`.
- `CLAUDE_MODEL` is a non-secret runtime hint, not the enforcement boundary.
- The Claude Code wrapper should pin `--model claude-haiku-4-5-20251001` internally and prevent candidate-supplied model overrides from taking effect.

## Gateway Endpoint

Implement in the terminal server:

```text
POST /claude-gateway/v1/messages
```

Behavior:

- Require `Authorization: Bearer <session-token>`.
- Hash the token with `CLAUDE_GATEWAY_TOKEN_SECRET`.
- Look up `claude_gateway_tokens.token_hash`.
- Reject missing, malformed, expired, or revoked tokens.
- Verify the linked session status is `active`.
- Forward the request body to `https://api.anthropic.com/v1/messages`.
- Replace candidate auth headers with server-side Anthropic auth:

```text
x-api-key: ANTHROPIC_API_KEY
```

- Preserve required Anthropic headers such as `anthropic-version`, `anthropic-beta`, `content-type`, and `accept`.
- Stream Anthropic responses back to Claude Code without buffering the full response.
- Do not log raw tokens, prompts, responses, or the Anthropic API key.
- Reject requests whose JSON body asks for any model other than `claude-haiku-4-5-20251001`, even if a candidate bypasses the wrapper and calls the gateway directly.

Reasoning:

- This is a narrow Anthropic-compatible gateway, not an open proxy.
- Claude Code keeps local orchestration behavior.
- The gateway only validates, forwards, and streams.
- The gateway should only allow the Haiku 4.5 model (`claude-haiku-4-5-20251001`) in v1.

## Caddy Routing

Add a Caddy route before the web catch-all:

```caddy
handle /claude-gateway* {
    reverse_proxy terminal:3001
}
```

Reasoning:

- Candidate sandboxes can reliably reach `https://${DOMAIN}/claude-gateway`.
- No Docker network changes are required for v1.
- This remains compatible with future multi-host sandbox placement.

## Caveats

- The bearer token is visible inside the sandbox. That is acceptable only because it is scoped to one session, short-lived, and revocable.
- No fixed spend budget is enforced in v1 by design.
- Cost dashboards remain approximate because they continue using PTY/output-based tracking.
- If Claude Code needs Anthropic endpoints beyond `/v1/messages`, add them explicitly after observing failures. Do not create a broad proxy.
- Existing deployed/running sandboxes must be rebuilt/restarted to receive gateway env vars.

## Test Plan

Unit-level/manual checks:

- Valid active-session token is accepted.
- Expired token is rejected.
- Revoked token is rejected.
- Missing or malformed bearer token is rejected.
- Token for completed/analyzing/analyzed session is rejected.
- Gateway strips candidate auth and uses only server-side `ANTHROPIC_API_KEY`.
- Streaming responses are forwarded incrementally.

Sandbox checks:

```bash
env | grep ANTHROPIC
```

Expected:

```text
ANTHROPIC_BASE_URL=...
ANTHROPIC_AUTH_TOKEN=...
```

Not expected:

```text
ANTHROPIC_API_KEY
```

Claude Code check:

```bash
claude
```

Run a simple prompt and confirm it completes through the gateway.

Deployment checks:

- Caddy routes `/claude-gateway/v1/messages` to terminal.
- Existing terminal WebSocket and file APIs still work.
- Existing cost tracking behavior is unchanged.
