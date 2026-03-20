-- Add workspace_snapshot column to sessions table.
-- Stores archived workspace files captured at session end.
-- Shape: { archived_at: ISO string, tree: FileNode[], files: WorkspaceFile[] }
-- NULL means no snapshot was taken (session ended before this feature, or dir was empty).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_snapshot JSONB DEFAULT NULL;
