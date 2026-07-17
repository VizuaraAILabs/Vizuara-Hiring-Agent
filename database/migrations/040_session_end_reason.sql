-- Track why a candidate session ended (manual end, timer expiry, workspace
-- failure). Admin-only visibility for now — recruiter-facing queries must
-- keep using explicit column lists that omit this column.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_reason TEXT DEFAULT NULL;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_end_reason_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_end_reason_check
  CHECK (
    end_reason IS NULL OR
    end_reason IN ('candidate_ended', 'timer_expired', 'workspace_failed')
  );
