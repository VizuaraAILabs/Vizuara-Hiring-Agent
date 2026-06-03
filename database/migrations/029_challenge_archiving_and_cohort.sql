-- Dashboard organization for old or grouped assessments.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS cohort_label TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_company_archive
  ON challenges(company_id, archived_at, is_active, ends_at);

CREATE INDEX IF NOT EXISTS idx_challenges_company_cohort
  ON challenges(company_id, cohort_label);
