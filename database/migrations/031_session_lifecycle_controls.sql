-- Recruiter-managed candidate lifecycle controls.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS candidate_lifecycle_status TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS candidate_lifecycle_reason TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS candidate_lifecycle_updated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS candidate_lifecycle_updated_by_email TEXT DEFAULT NULL;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_candidate_lifecycle_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_candidate_lifecycle_status_check
  CHECK (
    candidate_lifecycle_status IS NULL OR
    candidate_lifecycle_status IN ('revoked', 'no_show', 'withdrawn', 'disqualified')
  );

CREATE INDEX IF NOT EXISTS idx_sessions_candidate_lifecycle_status
  ON sessions(challenge_id, candidate_lifecycle_status);

CREATE TABLE IF NOT EXISTS session_lifecycle_events (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_value TEXT DEFAULT NULL,
  new_value TEXT DEFAULT NULL,
  actor_email TEXT NOT NULL,
  reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_lifecycle_events_session_created
  ON session_lifecycle_events(session_id, created_at DESC);
