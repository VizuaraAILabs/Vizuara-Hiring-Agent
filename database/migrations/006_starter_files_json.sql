-- Add starter_files JSONB column to store AI-generated starter project files
-- Format: [{"path": "src/App.tsx", "content": "..."}, {"path": "package.json", "content": "..."}]
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS starter_files JSONB;
