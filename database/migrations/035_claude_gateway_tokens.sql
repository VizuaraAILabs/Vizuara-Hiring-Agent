-- Session-scoped Claude gateway bearer tokens.
-- Raw tokens are never stored; terminal-server stores and validates HMAC hashes.

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
