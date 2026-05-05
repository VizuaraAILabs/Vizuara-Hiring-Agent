-- Hiring Agent Platform - PostgreSQL Schema
-- Adapted from SQLite schema for production deployment

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  time_limit_min INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starter_files_dir TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed', 'analyzing', 'analyzed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interactions (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id),
  sequence_num INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction TEXT NOT NULL CHECK(direction IN ('input', 'output')),
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('terminal', 'prompt', 'response', 'command')),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id),
  overall_score REAL NOT NULL,
  problem_decomposition REAL NOT NULL DEFAULT 0,
  first_principles REAL NOT NULL DEFAULT 0,
  creativity REAL NOT NULL DEFAULT 0,
  iteration_quality REAL NOT NULL DEFAULT 0,
  debugging_approach REAL NOT NULL DEFAULT 0,
  architecture_thinking REAL NOT NULL DEFAULT 0,
  communication_clarity REAL NOT NULL DEFAULT 0,
  efficiency REAL NOT NULL DEFAULT 0,
  dimension_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  key_moments JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_complexity JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_narrative TEXT NOT NULL DEFAULT '',
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  areas_for_growth JSONB NOT NULL DEFAULT '[]'::jsonb,
  hiring_recommendation TEXT NOT NULL CHECK(hiring_recommendation IN ('strong_yes', 'yes', 'neutral', 'no', 'strong_no')),
  raw_claude_response TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interaction_annotations (
  id SERIAL PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analysis_results(id),
  interaction_id INTEGER NOT NULL REFERENCES interactions(id),
  annotation_type TEXT NOT NULL CHECK(annotation_type IN ('strength', 'weakness', 'pivot', 'insight')),
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  dimension TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_challenges_company ON challenges(company_id);
CREATE INDEX IF NOT EXISTS idx_sessions_challenge ON sessions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_session ON analysis_results(session_id);
CREATE INDEX IF NOT EXISTS idx_annotations_analysis ON interaction_annotations(analysis_id);
