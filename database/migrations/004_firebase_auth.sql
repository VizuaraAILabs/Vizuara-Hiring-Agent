-- Add Firebase UID to companies for Vizuara Auth integration
ALTER TABLE companies ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_companies_firebase_uid ON companies(firebase_uid);

-- password_hash is no longer used (auth is delegated to vizuara.ai)
-- but we keep the column for backwards compatibility with existing records
