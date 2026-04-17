-- ============================================
-- Migration: 021_secure_signup_workflow
-- Description: Add secure signup workflow tables for student challenges,
--              teacher applications, and two-factor login challenges.
-- Dependencies: 020_enrollment_integrity_guard
-- Author: MabiniLMS Team
-- Created: 2026-04-17
-- ============================================

-- UP

CREATE TABLE IF NOT EXISTS public.student_signup_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  request_ip TEXT,
  request_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_signup_challenges_token_hash
  ON public.student_signup_challenges (token_hash);

CREATE INDEX IF NOT EXISTS idx_student_signup_challenges_email_created_at
  ON public.student_signup_challenges (email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.teacher_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_email_verification',
  verification_token_hash TEXT,
  verification_expires_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_reason TEXT,
  onboarding_token_hash TEXT,
  onboarding_expires_at TIMESTAMPTZ,
  onboarding_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teacher_applications_status_check'
      AND conrelid = 'public.teacher_applications'::regclass
  ) THEN
    ALTER TABLE public.teacher_applications
      ADD CONSTRAINT teacher_applications_status_check
      CHECK (status IN ('pending_email_verification', 'pending_review', 'approved', 'rejected'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_applications_verification_token_hash
  ON public.teacher_applications (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_applications_onboarding_token_hash
  ON public.teacher_applications (onboarding_token_hash)
  WHERE onboarding_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_applications_email_active
  ON public.teacher_applications (lower(email))
  WHERE status IN ('pending_email_verification', 'pending_review', 'approved');

CREATE INDEX IF NOT EXISTS idx_teacher_applications_status_created_at
  ON public.teacher_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.two_factor_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_login_challenges_user_active
  ON public.two_factor_login_challenges (user_id, expires_at DESC)
  WHERE consumed_at IS NULL;

-- DOWN
-- Data rollback is intentionally omitted for security/audit history tables.
