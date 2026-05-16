-- ============================================
-- Migration: 046_exam_question_images
-- Description: Add image_url column to exam_questions for per-question image attachments
-- Dependencies: 026_quiz_exam_builder_phase3
-- Author: MabiniLMS Team
-- Created: 2026-05-16
-- ============================================

-- UP
ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.exam_questions.image_url IS
    'Optional public URL of an image attached to this question, displayed above the prompt during exam attempts.';

-- DOWN
ALTER TABLE public.exam_questions
    DROP COLUMN IF EXISTS image_url;
