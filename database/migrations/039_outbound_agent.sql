-- Outbound agent control plane: runs, prospects, evidence, contacts, drafts, messages, and suppression.

CREATE TABLE IF NOT EXISTS outbound_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_by_email TEXT,
  started_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_agent_runs_mode_check'
  ) THEN
    ALTER TABLE outbound_agent_runs ADD CONSTRAINT outbound_agent_runs_mode_check
      CHECK (mode IN ('discovery', 'enrichment', 'draft_outreach', 'reply_classification'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_agent_runs_status_check'
  ) THEN
    ALTER TABLE outbound_agent_runs ADD CONSTRAINT outbound_agent_runs_status_check
      CHECK (status IN ('queued', 'accepted', 'running', 'completed', 'failed', 'canceled', 'stale'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS outbound_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  fit_score INTEGER,
  score_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_run_id UUID REFERENCES outbound_agent_runs(id) ON DELETE SET NULL,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_prospects_status_check'
  ) THEN
    ALTER TABLE outbound_prospects ADD CONSTRAINT outbound_prospects_status_check
      CHECK (status IN (
        'new', 'reviewed', 'approved', 'rejected', 'enrichment_requested', 'enriched',
        'draft_requested', 'drafted', 'contacted', 'replied', 'disqualified', 'suppressed'
      ));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_prospects_domain_unique
  ON outbound_prospects (LOWER(domain))
  WHERE domain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_prospects_name_unique_without_domain
  ON outbound_prospects (LOWER(company_name))
  WHERE domain IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_prospects_status
  ON outbound_prospects (status, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES outbound_agent_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  quoted_text TEXT,
  confidence INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_evidence_prospect
  ON outbound_evidence (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  full_name TEXT,
  role_title TEXT,
  email TEXT,
  email_status TEXT NOT NULL DEFAULT 'unknown',
  linkedin_url TEXT,
  source TEXT,
  confidence INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_contacts_prospect
  ON outbound_contacts (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES outbound_contacts(id) ON DELETE SET NULL,
  run_id UUID REFERENCES outbound_agent_runs(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  sequence_step INTEGER NOT NULL DEFAULT 1,
  subject TEXT,
  body TEXT NOT NULL,
  personalization_basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by_email TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_drafts_prospect
  ON outbound_drafts (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES outbound_drafts(id) ON DELETE SET NULL,
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES outbound_contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  sent_by_email TEXT,
  sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_outbound_messages_prospect
  ON outbound_messages (prospect_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS outbound_suppression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_suppression_type_value
  ON outbound_suppression (type, LOWER(value));
