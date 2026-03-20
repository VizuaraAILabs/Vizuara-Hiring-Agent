-- Migration 015: Add role and tech_stack columns to challenges
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS tech_stack TEXT;
