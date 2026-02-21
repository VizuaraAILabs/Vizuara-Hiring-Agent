-- Hiring Agent Platform - Initial Schema

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  time_limit_min INTEGER NOT NULL DEFAULT 60,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed', 'analyzed')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  sequence_num INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  direction TEXT NOT NULL CHECK(direction IN ('input', 'output')),
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('terminal', 'prompt', 'response', 'command')),
  metadata TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
  overall_score REAL NOT NULL,
  problem_decomposition REAL NOT NULL DEFAULT 0,
  first_principles REAL NOT NULL DEFAULT 0,
  creativity REAL NOT NULL DEFAULT 0,
  iteration_quality REAL NOT NULL DEFAULT 0,
  debugging_approach REAL NOT NULL DEFAULT 0,
  architecture_thinking REAL NOT NULL DEFAULT 0,
  communication_clarity REAL NOT NULL DEFAULT 0,
  efficiency REAL NOT NULL DEFAULT 0,
  dimension_details TEXT NOT NULL DEFAULT '{}',
  key_moments TEXT NOT NULL DEFAULT '[]',
  timeline_data TEXT NOT NULL DEFAULT '[]',
  prompt_complexity TEXT NOT NULL DEFAULT '[]',
  category_breakdown TEXT NOT NULL DEFAULT '{}',
  summary_narrative TEXT NOT NULL DEFAULT '',
  strengths TEXT NOT NULL DEFAULT '[]',
  areas_for_growth TEXT NOT NULL DEFAULT '[]',
  hiring_recommendation TEXT NOT NULL CHECK(hiring_recommendation IN ('strong_yes', 'yes', 'neutral', 'no', 'strong_no')),
  raw_claude_response TEXT,
  model_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interaction_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id TEXT NOT NULL REFERENCES analysis_results(id),
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
