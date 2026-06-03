-- Personalized invite email templates and delivery state.

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS invite_email_subject TEXT DEFAULT NULL;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS invite_email_body TEXT DEFAULT NULL;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS invite_email_status TEXT DEFAULT NULL
  CHECK (invite_email_status IS NULL OR invite_email_status IN ('not_sent', 'sent', 'failed'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS invite_email_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS invite_email_error TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_invite_email_status
  ON sessions(challenge_id, invite_email_status);
