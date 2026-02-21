-- Cost Tracking Tables
-- Tracks API usage (Anthropic, Gemini) and infrastructure costs (Docker, VPS)

CREATE TABLE IF NOT EXISTS usage_events (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  company_id UUID REFERENCES companies(id),
  provider TEXT NOT NULL CHECK(provider IN ('anthropic', 'gemini', 'docker', 'vps')),
  event_type TEXT NOT NULL CHECK(event_type IN ('api_call', 'container_run', 'fixed_monthly')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT,
  duration_seconds INTEGER,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_settings (
  company_id UUID UNIQUE REFERENCES companies(id),
  vps_monthly_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  anthropic_input_rate NUMERIC(10,4) NOT NULL DEFAULT 3.0,
  anthropic_output_rate NUMERIC(10,4) NOT NULL DEFAULT 15.0,
  gemini_input_rate NUMERIC(10,4) NOT NULL DEFAULT 0.15,
  gemini_output_rate NUMERIC(10,4) NOT NULL DEFAULT 0.60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_company ON usage_events(company_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at);
