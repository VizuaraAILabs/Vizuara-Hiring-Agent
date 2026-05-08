CREATE TABLE IF NOT EXISTS pending_signups (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups(email);
