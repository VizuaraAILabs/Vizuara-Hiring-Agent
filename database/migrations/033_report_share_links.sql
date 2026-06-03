-- Expiring, recruiter-controlled read-only links for analyzed candidate reports.
CREATE TABLE IF NOT EXISTS report_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  created_by_email TEXT DEFAULT NULL,
  created_by_name TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_share_links_session_active
  ON report_share_links(session_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_share_links_one_unrevoked
  ON report_share_links(session_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_share_links_token
  ON report_share_links(token);
