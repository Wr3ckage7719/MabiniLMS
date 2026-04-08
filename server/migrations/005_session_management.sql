-- filepath: d:\MabiniLMS\server\migrations\005_session_management.sql
-- ============================================
-- Migration: 005_session_management
-- Description: Add session management and password tracking columns
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-07
-- ============================================

-- UP
-- Apply migration: Add session management columns

-- 1. Add password_changed_at column to track password changes
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.password_changed_at IS 'Timestamp when user last changed their password (used for session invalidation)';

-- 2. Create function to update password_changed_at on auth.users password change
-- Note: This requires a trigger on auth.users which Supabase may restrict
-- Alternative: Update password_changed_at in application code when password is changed

-- 3. Create session_logs table for tracking login/logout events
CREATE TABLE IF NOT EXISTS public.session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL, -- 'login', 'logout', 'token_refresh', 'session_expired'
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for session logs
CREATE INDEX IF NOT EXISTS idx_session_logs_user_id 
  ON public.session_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_session_logs_created_at 
  ON public.session_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_logs_event_type 
  ON public.session_logs(event_type);

COMMENT ON TABLE public.session_logs IS 'Tracks user session events for security auditing';

-- 4. Enable RLS on session_logs
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_logs_select_policy ON public.session_logs;
CREATE POLICY session_logs_select_policy ON public.session_logs
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS session_logs_insert_policy ON public.session_logs;
CREATE POLICY session_logs_insert_policy ON public.session_logs
  FOR INSERT WITH CHECK (true); -- Allow inserts from authenticated users

-- 5. Grant permissions
GRANT ALL ON public.session_logs TO authenticated;

-- DOWN
-- Rollback migration

/*
DROP POLICY IF EXISTS session_logs_select_policy ON public.session_logs;
DROP POLICY IF EXISTS session_logs_insert_policy ON public.session_logs;
DROP TABLE IF EXISTS public.session_logs;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS password_changed_at;
*/
