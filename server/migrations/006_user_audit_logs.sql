-- filepath: d:\MabiniLMS\server\migrations\006_user_audit_logs.sql
-- ============================================
-- Migration: 006_user_audit_logs
-- Description: Add user audit logging for security tracking
-- Dependencies: 001_initial_schema, 004_admin_system
-- Author: MabiniLMS Team
-- Created: 2026-04-07
-- ============================================

-- UP
-- Apply migration: Create user audit logs table

-- 1. Create user_audit_logs table
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB DEFAULT '{}'::JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user_id 
  ON public.user_audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_event_type 
  ON public.user_audit_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_resource 
  ON public.user_audit_logs(resource_type, resource_id) 
  WHERE resource_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_created_at 
  ON public.user_audit_logs(created_at DESC);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user_event_date 
  ON public.user_audit_logs(user_id, event_type, created_at DESC);

-- 3. Add table comments
COMMENT ON TABLE public.user_audit_logs IS 'Tracks all sensitive user actions for security auditing';
COMMENT ON COLUMN public.user_audit_logs.event_type IS 'Type of event: login_success, password_changed, profile_updated, assignment_submitted, grade_viewed, etc.';
COMMENT ON COLUMN public.user_audit_logs.resource_type IS 'Type of resource affected: course, assignment, grade, material';
COMMENT ON COLUMN public.user_audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN public.user_audit_logs.details IS 'JSON data with event-specific details';

-- 4. Enable RLS
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own audit logs
DROP POLICY IF EXISTS user_audit_logs_user_select ON public.user_audit_logs;
CREATE POLICY user_audit_logs_user_select ON public.user_audit_logs
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Admins can see all audit logs
DROP POLICY IF EXISTS user_audit_logs_admin_select ON public.user_audit_logs;
CREATE POLICY user_audit_logs_admin_select ON public.user_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Teachers can see audit logs for their courses
DROP POLICY IF EXISTS user_audit_logs_teacher_select ON public.user_audit_logs;
CREATE POLICY user_audit_logs_teacher_select ON public.user_audit_logs
  FOR SELECT USING (
    resource_type = 'course' AND
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE id = resource_id AND teacher_id = auth.uid()
    )
  );

-- Allow authenticated users to insert (via service)
DROP POLICY IF EXISTS user_audit_logs_insert ON public.user_audit_logs;
CREATE POLICY user_audit_logs_insert ON public.user_audit_logs
  FOR INSERT WITH CHECK (true);

-- 5. Grant permissions
GRANT SELECT, INSERT ON public.user_audit_logs TO authenticated;

-- 6. Create function for automatic session tracking (optional trigger)
CREATE OR REPLACE FUNCTION public.auto_log_profile_update()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields TEXT[];
BEGIN
  -- Detect which fields changed
  IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
    changed_fields := array_append(changed_fields, 'first_name');
  END IF;
  
  IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
    changed_fields := array_append(changed_fields, 'last_name');
  END IF;
  
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
    changed_fields := array_append(changed_fields, 'avatar_url');
  END IF;
  
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    changed_fields := array_append(changed_fields, 'email');
  END IF;

  -- Only log if something actually changed
  IF array_length(changed_fields, 1) > 0 THEN
    INSERT INTO public.user_audit_logs (user_id, event_type, details)
    VALUES (
      NEW.id,
      'profile_updated',
      jsonb_build_object(
        'changed_fields', to_jsonb(changed_fields),
        'timestamp', NOW()
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic profile update logging
DROP TRIGGER IF EXISTS trigger_log_profile_update ON public.profiles;
CREATE TRIGGER trigger_log_profile_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_log_profile_update();

-- DOWN
-- Rollback migration

/*
DROP TRIGGER IF EXISTS trigger_log_profile_update ON public.profiles;
DROP FUNCTION IF EXISTS public.auto_log_profile_update();

DROP POLICY IF EXISTS user_audit_logs_user_select ON public.user_audit_logs;
DROP POLICY IF EXISTS user_audit_logs_admin_select ON public.user_audit_logs;
DROP POLICY IF EXISTS user_audit_logs_teacher_select ON public.user_audit_logs;
DROP POLICY IF EXISTS user_audit_logs_insert ON public.user_audit_logs;

DROP TABLE IF EXISTS public.user_audit_logs;
*/
