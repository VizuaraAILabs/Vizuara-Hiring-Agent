-- Challenge-level assessment entry window.

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_access_window
  ON challenges(starts_at, ends_at);
