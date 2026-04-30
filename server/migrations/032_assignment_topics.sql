-- ============================================
-- Migration: 032_assignment_topics
-- Description: Per-assignment free-form topic labels (e.g. "Homework",
--              "Group Work", "Algebra") so teachers can tag classwork and
--              students can filter the Classwork tab. Stored as a text
--              array (small N per assignment, no need for a join table).
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-30
-- ============================================

-- UP
ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- GIN index supports `topics @> ARRAY[$1]` and `topics && ARRAY[$1, ...]`
-- filter queries from the classwork tab.
CREATE INDEX IF NOT EXISTS idx_assignments_topics
    ON public.assignments USING GIN (topics);

COMMENT ON COLUMN public.assignments.topics IS
    'Teacher-assigned free-form topic labels for organizing and filtering classwork. Empty array means untagged.';

-- DOWN
-- DROP INDEX IF EXISTS idx_assignments_topics;
-- ALTER TABLE public.assignments DROP COLUMN IF EXISTS topics;
