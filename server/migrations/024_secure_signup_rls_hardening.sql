-- ============================================
-- Migration: 024_secure_signup_rls_hardening
-- Description: Explicitly enable and lock down RLS policies for secure signup workflow tables.
-- Dependencies: 023_core_teaching_write_path_hardening
-- Author: MabiniLMS Team
-- Created: 2026-04-18
-- ============================================

-- UP
-- Apply migration: Harden secure signup/challenge tables against direct anon/authenticated access.

ALTER TABLE IF EXISTS public.student_signup_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teacher_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.two_factor_login_challenges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'student_signup_challenges'
        AND policyname = 'Service role manages student signup challenges'
    ) THEN
      CREATE POLICY "Service role manages student signup challenges"
        ON public.student_signup_challenges
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'teacher_applications'
        AND policyname = 'Service role manages teacher applications'
    ) THEN
      CREATE POLICY "Service role manages teacher applications"
        ON public.teacher_applications
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'two_factor_login_challenges'
        AND policyname = 'Service role manages 2fa login challenges'
    ) THEN
      CREATE POLICY "Service role manages 2fa login challenges"
        ON public.two_factor_login_challenges
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
  ELSE
    RAISE NOTICE 'service_role role not found; skipping service-role-only policy creation.';
  END IF;
END;
$$;

-- DOWN
-- Rollback intentionally omitted to avoid weakening security posture for sensitive auth workflow tables.
