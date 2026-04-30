-- ============================================
-- Migration: 033_course_lms_config
-- Description: Per-course LMS configuration knobs the teacher controls
--              up-front: searchable tags, completion criteria, override
--              gradebook weights, and an optional enrolment key (course
--              password) on top of the existing class code invitation flow.
-- Dependencies: 001_initial_schema, 032_assignment_topics
-- Author: MabiniLMS Team
-- Created: 2026-04-30
-- ============================================

-- UP

-- Free-form course tags (e.g. #Safety, #Onboarding) so the dashboard search
-- can match by tag and a future course catalog can group by them.
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_courses_tags
    ON public.courses USING GIN (tags);

COMMENT ON COLUMN public.courses.tags IS
    'Teacher-assigned free-form course tags (e.g. #Safety, #Onboarding) for search and catalog grouping.';

-- Completion policy is a discriminated JSON shape. Validated client-side and
-- by Zod on the server. NULL means "use the default rule" (currently:
-- assignment graded/submitted ratio).
--   { "type": "all_items_viewed" }
--   { "type": "passing_score_on", "assignment_id": "...", "threshold": 80 }
--   { "type": "weighted_score_threshold", "threshold": 75 }
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS completion_policy JSONB;

COMMENT ON COLUMN public.courses.completion_policy IS
    'Teacher-defined completion rule for this course. NULL = default (graded+submitted / total assignments).';

-- Per-course override of the Mabini default category weights. Shape mirrors
-- the existing weighted-grade keys: exam, quiz, activity, recitation,
-- attendance, project. Values are fractions that should sum to 1.0 (the
-- server normalizes if they do not). NULL = use the institutional default.
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS category_weights JSONB;

COMMENT ON COLUMN public.courses.category_weights IS
    'Per-course override of the Mabini category weights. Keys: exam, quiz, activity, recitation, attendance, project. NULL = institutional default.';

-- Optional course-level password (separate from the existing 8-char class
-- code). When set, students joining via code are also prompted for this
-- key. Stored as plain text — these are short shared classroom passwords,
-- not user secrets.
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS enrolment_key TEXT;

COMMENT ON COLUMN public.courses.enrolment_key IS
    'Optional shared password gating self-enrolment. NULL means anyone with the class code can join.';

-- DOWN
-- DROP INDEX IF EXISTS idx_courses_tags;
-- ALTER TABLE public.courses DROP COLUMN IF EXISTS enrolment_key;
-- ALTER TABLE public.courses DROP COLUMN IF EXISTS category_weights;
-- ALTER TABLE public.courses DROP COLUMN IF EXISTS completion_policy;
-- ALTER TABLE public.courses DROP COLUMN IF EXISTS tags;
