-- Migration 014: Expand content_type check constraint to include interview interaction types
-- The interviewer widget uses 'interview_question' and 'interview_response' content types
-- which were not present in the original constraint.

ALTER TABLE interactions DROP CONSTRAINT interactions_content_type_check;

ALTER TABLE interactions ADD CONSTRAINT interactions_content_type_check
  CHECK (content_type IN ('terminal', 'prompt', 'response', 'command', 'interview_question', 'interview_response'));
