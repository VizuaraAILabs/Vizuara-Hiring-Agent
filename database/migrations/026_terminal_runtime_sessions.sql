-- Durable runtime ownership for live terminal-server Docker sessions.

CREATE TABLE IF NOT EXISTS terminal_runtime_sessions (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  host_work_dir TEXT NOT NULL,
  assigned_terminal_server_id TEXT NOT NULL,
  runtime_status TEXT NOT NULL DEFAULT 'starting'
    CHECK (runtime_status IN ('starting', 'active', 'terminating', 'terminated', 'orphaned')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_runtime_sessions_server_status
  ON terminal_runtime_sessions(assigned_terminal_server_id, runtime_status);

CREATE INDEX IF NOT EXISTS idx_terminal_runtime_sessions_lease
  ON terminal_runtime_sessions(runtime_status, lease_expires_at);
