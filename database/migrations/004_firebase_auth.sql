-- Add Firebase UID to companies for Vizuara Auth integration
ALTER TABLE companies ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_companies_firebase_uid ON companies(firebase_uid);
