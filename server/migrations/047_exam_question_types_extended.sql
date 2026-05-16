-- ============================================
-- Migration: 047_exam_question_types_extended
-- Description: Extend exam question item_type to support fill_in_blank and essay types
-- Dependencies: 026_quiz_exam_builder_phase3
-- Author: MabiniLMS Team
-- ============================================

-- UP

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_item_type_check;

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_item_type_check
    CHECK (item_type IN ('multiple_choice', 'true_false', 'short_answer', 'fill_in_blank', 'essay'));

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
        item_type IN ('short_answer', 'fill_in_blank', 'essay')
        AND jsonb_typeof(choices) = 'array'
        AND jsonb_array_length(choices) = 0
        AND correct_choice_index = 0
      )
    );

COMMENT ON COLUMN public.exam_questions.item_type IS
    'Question item type (multiple_choice, true_false, short_answer, fill_in_blank, essay).';

-- DOWN

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

ALTER TABLE public.exam_questions
    DROP CONSTRAINT IF EXISTS exam_questions_item_type_check;

ALTER TABLE public.exam_questions
    ADD CONSTRAINT exam_questions_item_type_check
    CHECK (item_type IN ('multiple_choice', 'true_false', 'short_answer'));
