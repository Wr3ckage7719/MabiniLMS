-- ============================================
-- Migration: 031_enrollment_archive
-- Description: Per-student enrollment archive flag so students can hide
--              a class from their view without affecting the course itself.
--              Mirrors Google Classroom's student-side archive behavior;
--              teacher/admin course-level archive on courses.status remains.
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-24
-- ============================================

-- UP
ALTER TABLE public.enrollments
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollments_archived_at
    ON public.enrollments(archived_at);

COMMENT ON COLUMN public.enrollments.archived_at IS
    'When the enrolled student archived this class from their own view. NULL when active.';

-- DOWN
-- DROP INDEX IF EXISTS idx_enrollments_archived_at;
-- ALTER TABLE public.enrollments DROP COLUMN IF EXISTS archived_at;
