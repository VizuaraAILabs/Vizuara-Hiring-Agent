-- Preserve historical spend for companies after their profile is deleted.
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS company_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_usage_events_company_deleted ON usage_events(company_deleted);
