-- Add an explicit failed analysis state and backend-only diagnostics.
-- Company-facing APIs should continue to expose only sessions.status.

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'queued', 'analyzing', 'analyzed', 'analysis failed'));

CREATE TABLE IF NOT EXISTS analysis_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  error_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_failures_session_created
  ON analysis_failures(session_id, created_at DESC);
