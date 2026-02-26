-- Add plan and trial columns to companies table for quota enforcement
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';

-- Add CHECK constraint separately (IF NOT EXISTS doesn't support inline CHECK)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_plan_check'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_plan_check
      CHECK (plan IN ('trial', 'starter', 'growth', 'enterprise'));
  END IF;
END $$;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Set trial_ends_at for existing companies that don't have it
UPDATE companies SET trial_ends_at = created_at + INTERVAL '14 days'
  WHERE trial_ends_at IS NULL;
