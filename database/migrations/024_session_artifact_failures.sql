-- Backend-only operational failures for submitted session artifacts.
-- Company-facing APIs should not expose this table.

CREATE TABLE IF NOT EXISTS session_artifact_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  error_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_artifact_failures_session_created
  ON session_artifact_failures(session_id, created_at DESC);
