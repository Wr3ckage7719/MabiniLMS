-- ============================================
-- Migration: 041_perf_composite_indexes
-- Description: Add composite indexes for the most common filter patterns:
--   enrollments by (course_id, status), (student_id, status)
--   assignments by (course_id, due_date)
--   submissions by (assignment_id, status)
--   material_progress by (course_id, user_id)
--   lesson_progress by (student_id, lesson_id)
--   notifications by (user_id, created_at DESC)
-- All indexes use IF NOT EXISTS so the migration is idempotent and safe to
-- run on databases that may have been partially migrated.
-- Dependencies: 001_initial_schema, 003_notifications, 025_material_progress_and_submission_window, 037_lesson_centric_flow
-- Author: MabiniLMS Team
-- Created: 2026-05-07
-- ============================================

-- Enrollment queries are always filtered by course AND status
CREATE INDEX IF NOT EXISTS idx_enrollments_course_status
  ON public.enrollments(course_id, status);

-- Student dashboard queries filter their own enrollments by status
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status
  ON public.enrollments(student_id, status);

-- Assignment list filtered by course + sorted by due_date
CREATE INDEX IF NOT EXISTS idx_assignments_course_due
  ON public.assignments(course_id, due_date NULLS LAST);

-- Submissions filtered by assignment + status (teacher grading view)
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_status
  ON public.submissions(assignment_id, status);

-- Material progress lookups for a course's students
CREATE INDEX IF NOT EXISTS idx_material_progress_course_user
  ON public.material_progress(course_id, user_id);

-- Lesson progress lookups
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_lesson
  ON public.lesson_progress(student_id, lesson_id);

-- Notifications for a user, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
