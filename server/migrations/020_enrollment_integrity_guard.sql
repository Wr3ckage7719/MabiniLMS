-- ============================================
-- Migration: 020_enrollment_integrity_guard
-- Description: Remove duplicate enrollments and enforce uniqueness on (course_id, student_id)
-- Dependencies: 019_normalize_enrollment_status
-- Author: MabiniLMS Team
-- Created: 2026-04-17
-- ============================================

-- UP

-- Normalize any legacy enrollment status values before de-duplication.
UPDATE public.enrollments
SET status = 'active'
WHERE lower(coalesce(status::text, '')) = 'enrolled';

-- Keep one canonical row per (course_id, student_id) pair and remove duplicates.
WITH ranked_enrollments AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY course_id, student_id
      ORDER BY
        CASE
          WHEN lower(coalesce(status::text, '')) = 'active' THEN 0
          WHEN lower(coalesce(status::text, '')) = 'enrolled' THEN 0
          WHEN lower(coalesce(status::text, '')) = 'completed' THEN 1
          WHEN lower(coalesce(status::text, '')) = 'dropped' THEN 2
          ELSE 3
        END,
        enrolled_at DESC NULLS LAST,
        id DESC
    ) AS rank_in_pair
  FROM public.enrollments
  WHERE course_id IS NOT NULL
    AND student_id IS NOT NULL
), removed_duplicates AS (
  DELETE FROM public.enrollments AS enrollment
  USING ranked_enrollments AS ranked
  WHERE enrollment.id = ranked.id
    AND ranked.rank_in_pair > 1
  RETURNING enrollment.id
)
SELECT count(*) AS duplicate_rows_removed
FROM removed_duplicates;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.enrollments'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(course_id, student_id)%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'enrollments'
      AND indexdef ILIKE '%UNIQUE INDEX%'
      AND indexdef ILIKE '%(course_id, student_id)%'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_course_student_unique
      UNIQUE (course_id, student_id);
  END IF;
END;
$$;

-- DOWN
-- Duplicate cleanup is irreversible. Constraint/index rollback is intentionally omitted.
