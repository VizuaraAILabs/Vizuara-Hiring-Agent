-- Recruiter-owned review state for candidate reports.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS decision_label TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recruiter_notes TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_by_email TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_decision_label_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_decision_label_check
  CHECK (decision_label IS NULL OR decision_label IN ('shortlisted', 'hold', 'reject', 'hired'));

CREATE INDEX IF NOT EXISTS idx_sessions_decision_label
  ON sessions(challenge_id, decision_label);
