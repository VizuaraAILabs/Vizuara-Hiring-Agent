-- Add per-challenge session limit for admin-created challenges
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS sessions_limit INTEGER DEFAULT NULL;
