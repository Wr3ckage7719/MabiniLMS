-- ============================================
-- Migration: 026_quiz_exam_builder_phase3
-- Description: Extend quiz/exam builder schema for item types, order modes, and chapter pools
-- Dependencies: 013_proctored_exam_pipeline, 025_material_progress_and_submission_window
-- Author: MabiniLMS Team
-- Created: 2026-04-19
-- ============================================

-- UP
-- Apply migration: Extend assignment and exam question schema for Phase 3 builder controls

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS question_order_mode VARCHAR(20) NOT NULL DEFAULT 'sequence';

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS exam_question_selection_mode VARCHAR(20) NOT NULL DEFAULT 'random';

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS exam_chapter_pool JSONB NOT NULL DEFAULT '{"enabled":false,"chapters":[]}'::jsonb;

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_question_order_mode_check;

ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_question_order_mode_check
    CHECK (question_order_mode IN ('sequence', 'random'));

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_exam_question_selection_mode_check;

ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_exam_question_selection_mode_check
    CHECK (exam_question_selection_mode IN ('sequence', 'random'));

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_exam_chapter_pool_object_check;

ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_exam_chapter_pool_object_check
    CHECK (jsonb_typeof(exam_chapter_pool) = 'object');

ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(40) NOT NULL DEFAULT 'multiple_choice';

ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS answer_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS chapter_tag VARCHAR(120);

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_choices_array_check;

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_correct_choice_index_check;

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_item_type_check;

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_item_type_check
    CHECK (item_type IN ('multiple_choice', 'true_false', 'short_answer'));

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_answer_payload_object_check;

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_answer_payload_object_check
    CHECK (jsonb_typeof(answer_payload) = 'object');

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_shape_check;

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_shape_check
    CHECK (
      (
        item_type IN ('multiple_choice', 'true_false')
        AND jsonb_typeof(choices) = 'array'
        AND jsonb_array_length(choices) BETWEEN 2 AND 10
        AND correct_choice_index >= 0
        AND correct_choice_index < jsonb_array_length(choices)
      )
      OR
      (
        item_type = 'short_answer'
        AND jsonb_typeof(choices) = 'array'
        AND jsonb_array_length(choices) = 0
        AND correct_choice_index = 0
      )
    );

CREATE INDEX IF NOT EXISTS idx_exam_questions_assignment_chapter_tag
    ON public.exam_questions(assignment_id, chapter_tag)
    WHERE chapter_tag IS NOT NULL;

COMMENT ON COLUMN public.assignments.question_order_mode IS
    'Question ordering mode used by quiz/exam builders (sequence or random).';

COMMENT ON COLUMN public.assignments.exam_question_selection_mode IS
    'Exam question selection strategy before ordering (sequence or random).';

COMMENT ON COLUMN public.assignments.exam_chapter_pool IS
    'Exam chapter pool settings, including chapter tags and per-chapter selection counts.';

COMMENT ON COLUMN public.exam_questions.item_type IS
    'Question item type for builder extensibility (multiple_choice, true_false, short_answer).';

COMMENT ON COLUMN public.exam_questions.answer_payload IS
    'Canonical answer payload for non-MCQ and future item types.';

COMMENT ON COLUMN public.exam_questions.chapter_tag IS
    'Optional chapter tag used for exam chapter pool selection.';

-- DOWN
-- Rollback migration: Restore previous quiz/exam schema

DROP INDEX IF EXISTS idx_exam_questions_assignment_chapter_tag;

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_shape_check;

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_answer_payload_object_check;

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_item_type_check;

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_choices_array_check
    CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) BETWEEN 2 AND 10);

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_correct_choice_index_check
    CHECK (correct_choice_index >= 0 AND correct_choice_index < jsonb_array_length(choices));

ALTER TABLE public.exam_questions
    DROP COLUMN IF EXISTS chapter_tag;

ALTER TABLE public.exam_questions
    DROP COLUMN IF EXISTS answer_payload;

ALTER TABLE public.exam_questions
    DROP COLUMN IF EXISTS item_type;

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_exam_chapter_pool_object_check;

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_exam_question_selection_mode_check;

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_question_order_mode_check;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS exam_chapter_pool;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS exam_question_selection_mode;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS question_order_mode;
