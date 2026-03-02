-- Add JSONB column to store AI-generated starter files directly in the database.
-- The existing starter_files_dir TEXT column is kept for backward compatibility
-- with the 6 seeded challenges that reference filesystem directories.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS starter_files JSONB;
