-- Allow sessions to distinguish queued analysis from active analysis.

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'queued', 'analyzing', 'analyzed'));
