-- Feedback system for ArcEval
-- company_id references the companies table (companies ARE the users in ArcEval)

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('emoji', 'nps', 'thumbs', 'survey', 'general')),
  course_slug TEXT,
  pod_slug TEXT,
  content_type TEXT CHECK (content_type IN ('article', 'notebook', 'case-study', 'pod', 'course')),
  notebook_order INTEGER,
  rating INTEGER,
  comment TEXT,
  survey_data JSONB,
  category TEXT CHECK (category IN ('bug', 'suggestion', 'content', 'other')),
  page_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevents duplicate emoji/nps/thumbs ratings per company per content item.
-- general and survey types can have multiple rows (no unique constraint).
CREATE UNIQUE INDEX IF NOT EXISTS feedback_unique_per_content
  ON feedback (company_id, type, course_slug, pod_slug, content_type, notebook_order)
  WHERE type IN ('emoji', 'nps', 'thumbs');

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_type_idx ON feedback (type);
CREATE INDEX IF NOT EXISTS feedback_course_idx ON feedback (course_slug);

CREATE TABLE IF NOT EXISTS feedback_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK (tag IN ('too_easy', 'too_hard', 'great_examples', 'needs_more_code', 'confusing'))
);

CREATE INDEX IF NOT EXISTS feedback_tags_feedback_id_idx ON feedback_tags (feedback_id);
