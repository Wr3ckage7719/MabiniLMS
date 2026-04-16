-- ============================================
-- Migration: 019_normalize_enrollment_status
-- Description: Normalize legacy enrollment status values and prevent future legacy writes
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-17
-- ============================================

-- UP
-- Apply migration: Convert legacy 'enrolled' status to 'active' and normalize future writes

UPDATE public.enrollments
SET status = 'active'
WHERE lower(status::text) = 'enrolled';

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

COMMENT ON FUNCTION public.normalize_enrollment_status_to_active() IS
  'Normalizes legacy enrollment status value enrolled to active on insert/update.';

-- DOWN
-- Rollback migration: Remove enrollment status normalization trigger and function

DROP TRIGGER IF EXISTS trg_normalize_enrollment_status_to_active ON public.enrollments;
DROP FUNCTION IF EXISTS public.normalize_enrollment_status_to_active();
