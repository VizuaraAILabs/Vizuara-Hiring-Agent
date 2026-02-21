-- Add starter_files_dir column to challenges table
-- Points to a directory (relative to project root) containing starter files
-- that get copied into the candidate's workspace when a session starts.

ALTER TABLE challenges ADD COLUMN starter_files_dir TEXT;
