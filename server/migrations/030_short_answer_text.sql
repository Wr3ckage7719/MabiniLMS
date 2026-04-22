-- Migration 030: Short-answer text storage for exam attempt answers
-- Allows selected_choice_index to be NULL for short-answer questions
-- and stores free-text responses in answer_text.

-- UP
ALTER TABLE exam_attempt_answers
  ALTER COLUMN selected_choice_index DROP NOT NULL;

ALTER TABLE exam_attempt_answers
  ADD COLUMN IF NOT EXISTS answer_text TEXT;

-- DOWN
-- ALTER TABLE exam_attempt_answers ALTER COLUMN selected_choice_index SET NOT NULL;
-- ALTER TABLE exam_attempt_answers DROP COLUMN IF EXISTS answer_text;
