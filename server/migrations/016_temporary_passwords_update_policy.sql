-- ============================================
-- Migration: 016_temporary_passwords_update_policy
-- Description: Allow users/admins to mark temporary passwords as used
-- Dependencies: 004_admin_system
-- Author: MabiniLMS Team
-- Created: 2026-04-14
-- ============================================

-- UP
-- Ensure users can clear first-login temporary password requirements.

ALTER TABLE public.temporary_passwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS temporary_passwords_update_policy ON public.temporary_passwords;
CREATE POLICY temporary_passwords_update_policy ON public.temporary_passwords
  FOR UPDATE USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- DOWN
-- Rollback update policy for temporary passwords.

DROP POLICY IF EXISTS temporary_passwords_update_policy ON public.temporary_passwords;
