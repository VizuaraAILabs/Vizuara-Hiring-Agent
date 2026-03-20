-- Add seniority level, focus areas, and additional context to challenges
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS seniority TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS focus_areas TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS context TEXT;
