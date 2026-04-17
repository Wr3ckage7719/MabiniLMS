-- ============================================
-- Migration: 023_core_teaching_write_path_hardening
-- Description: Harden announcements, assignments, and enrollments schema for teacher write paths
-- Dependencies: 022_avatar_storage_bucket
-- Author: MabiniLMS Team
-- Created: 2026-04-17
-- ============================================

-- UP
-- Apply migration: Ensure core write-path tables and columns exist across legacy and partially-migrated databases.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- Announcements hardening
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.announcements
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.announcements
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.announcements
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.announcements
SET
  pinned = COALESCE(pinned, false),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, created_at, NOW());

ALTER TABLE IF EXISTS public.announcements
  ALTER COLUMN pinned SET DEFAULT false;
ALTER TABLE IF EXISTS public.announcements
  ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE IF EXISTS public.announcements
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_announcements_course_id ON public.announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON public.announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(course_id, pinned DESC, created_at DESC);

-- ---------------------------------------------------------------------
-- Assignments hardening
-- ---------------------------------------------------------------------

ALTER TABLE IF EXISTS public.assignments
  ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20);
ALTER TABLE IF EXISTS public.assignments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.assignments
  ADD COLUMN IF NOT EXISTS is_proctored BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.assignments
  ADD COLUMN IF NOT EXISTS exam_duration_minutes INTEGER;
ALTER TABLE IF EXISTS public.assignments
  ADD COLUMN IF NOT EXISTS proctoring_policy JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'assignments'
  ) THEN
    UPDATE public.assignments
    SET assignment_type = 'activity'
    WHERE assignment_type IS NULL
       OR lower(trim(assignment_type)) NOT IN ('exam', 'quiz', 'activity');

    ALTER TABLE public.assignments
      ALTER COLUMN assignment_type SET DEFAULT 'activity';
    ALTER TABLE public.assignments
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public.assignments
      ALTER COLUMN is_proctored SET DEFAULT false;
    ALTER TABLE public.assignments
      ALTER COLUMN proctoring_policy SET DEFAULT '{}'::jsonb;
  ELSE
    RAISE NOTICE 'assignments table not found; skipping assignments hardening block';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assignments'
      AND column_name = 'assignment_type'
  ) THEN
    BEGIN
      ALTER TABLE public.assignments
        ALTER COLUMN assignment_type SET NOT NULL;
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'assignment_type could not be forced to NOT NULL: %', SQLERRM;
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.assignments'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.assignments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%assignment_type%'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_assignment_type_check
      CHECK (assignment_type IN ('exam', 'quiz', 'activity'));
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'assignments'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_assignments_course ON public.assignments(course_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON public.assignments(due_date);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- Enrollments hardening
-- ---------------------------------------------------------------------

ALTER TABLE IF EXISTS public.enrollments
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.enrollments
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

DO $$
BEGIN
  UPDATE public.enrollments
  SET status = 'active'
  WHERE lower(coalesce(status::text, '')) = 'enrolled';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Enrollment status normalization skipped: %', SQLERRM;
END;
$$;

ALTER TABLE IF EXISTS public.enrollments
  ALTER COLUMN enrolled_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.enrollments
  ALTER COLUMN status SET DEFAULT 'active';

CREATE OR REPLACE FUNCTION public.normalize_enrollment_status_to_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(coalesce(NEW.status::text, '')) = 'enrolled' THEN
    NEW.status := 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_enrollment_status_to_active ON public.enrollments;
CREATE TRIGGER trg_normalize_enrollment_status_to_active
BEFORE INSERT OR UPDATE OF status ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_enrollment_status_to_active();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.enrollments'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.enrollments'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(course_id, student_id)%'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_course_student_unique
      UNIQUE (course_id, student_id);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END;
$$;

COMMENT ON FUNCTION public.normalize_enrollment_status_to_active() IS
  'Normalizes legacy enrollment status value enrolled to active on insert/update.';

-- DOWN
-- Rollback intentionally omitted.
-- This migration repairs production schema drift and normalizes critical data defaults.
