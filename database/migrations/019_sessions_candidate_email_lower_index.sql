-- Speed up public candidate analysis lookups by email.

CREATE INDEX IF NOT EXISTS idx_sessions_candidate_email_lower
  ON sessions (LOWER(candidate_email));
