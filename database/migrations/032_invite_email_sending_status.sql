-- Reserve invite email sends before calling the provider to avoid duplicate sends.

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_invite_email_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_invite_email_status_check
  CHECK (invite_email_status IS NULL OR invite_email_status IN ('not_sent', 'sending', 'sent', 'failed'));
