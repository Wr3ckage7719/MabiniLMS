-- ============================================
-- Migration: 004_admin_system
-- Description: Add admin functionality with teacher approval and student management
-- Dependencies: 001_initial_schema, 002_email_verification
-- Author: MabiniLMS Team
-- Created: 2026-04-07
-- ============================================

-- UP
-- Apply migration: Add admin system tables and columns

-- 1. Update profiles table with approval tracking columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS account_created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for pending approval queries
CREATE INDEX IF NOT EXISTS idx_profiles_pending_approval 
  ON public.profiles(pending_approval) WHERE pending_approval = TRUE;

-- Add index for created accounts
CREATE INDEX IF NOT EXISTS idx_profiles_created_by 
  ON public.profiles(account_created_by) WHERE account_created_by IS NOT NULL;

COMMENT ON COLUMN public.profiles.pending_approval IS 'Indicates if teacher account is awaiting admin approval';
COMMENT ON COLUMN public.profiles.approved_at IS 'Timestamp when account was approved by admin';
COMMENT ON COLUMN public.profiles.approved_by IS 'Admin user who approved the account';
COMMENT ON COLUMN public.profiles.account_created_by IS 'Admin user who created this account (for student accounts)';

-- 2. Create admin audit logs table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id 
  ON public.admin_audit_logs(admin_id);
  
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user_id 
  ON public.admin_audit_logs(target_user_id);
  
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_type 
  ON public.admin_audit_logs(action_type);
  
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at 
  ON public.admin_audit_logs(created_at DESC);

COMMENT ON TABLE public.admin_audit_logs IS 'Tracks all administrative actions for compliance and security';
COMMENT ON COLUMN public.admin_audit_logs.action_type IS 'Type of action: teacher_approved, teacher_rejected, student_created, role_changed, account_disabled, settings_updated';
COMMENT ON COLUMN public.admin_audit_logs.details IS 'JSON data with action-specific details (e.g., old/new values, reason)';

-- 3. Create system settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for updated_at
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at 
  ON public.system_settings(updated_at DESC);

COMMENT ON TABLE public.system_settings IS 'Configurable system-wide settings managed by admins';
COMMENT ON COLUMN public.system_settings.value IS 'JSON value allowing flexible storage of arrays, objects, or primitives';

-- Insert default system settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('institutional_email_domains', '[]'::JSONB, 'Array of allowed email domains for student signup (e.g., ["school.edu", "university.edu"])'),
  ('require_teacher_approval', 'true'::JSONB, 'Whether teacher accounts require admin approval before accessing features'),
  ('allow_student_self_signup', 'false'::JSONB, 'Whether students can self-register or only admins can create accounts'),
  ('max_upload_size_mb', '50'::JSONB, 'Maximum file upload size in megabytes'),
  ('session_timeout_minutes', '480'::JSONB, 'Session timeout in minutes (default 8 hours)')
ON CONFLICT (key) DO NOTHING;

-- 4. Create temporary passwords table
CREATE TABLE IF NOT EXISTS public.temporary_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  temp_password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for temporary password queries
CREATE INDEX IF NOT EXISTS idx_temporary_passwords_user_id 
  ON public.temporary_passwords(user_id);
  
CREATE INDEX IF NOT EXISTS idx_temporary_passwords_expires_at 
  ON public.temporary_passwords(expires_at) WHERE used_at IS NULL;

COMMENT ON TABLE public.temporary_passwords IS 'Tracks temporary passwords for student accounts created by admins';
COMMENT ON COLUMN public.temporary_passwords.must_change_password IS 'Forces password change on first login';
COMMENT ON COLUMN public.temporary_passwords.used_at IS 'Timestamp when temporary password was used for first login';

-- 5. Create function to automatically log admin actions (trigger)
CREATE OR REPLACE FUNCTION public.log_admin_action()
RETURNS TRIGGER AS $$
BEGIN
  -- This is a placeholder trigger function that can be customized
  -- Actual logging will be done in application code for better control
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Update RLS policies for admin tables

-- Admin audit logs: Only admins can read
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_logs_select_policy ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_select_policy ON public.admin_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- System settings: Admins can read/write, others can read
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_settings_select_policy ON public.system_settings;
CREATE POLICY system_settings_select_policy ON public.system_settings
  FOR SELECT USING (true); -- Anyone can read settings

DROP POLICY IF EXISTS system_settings_modify_policy ON public.system_settings;
CREATE POLICY system_settings_modify_policy ON public.system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Temporary passwords: Users can only see their own
ALTER TABLE public.temporary_passwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS temporary_passwords_select_policy ON public.temporary_passwords;
CREATE POLICY temporary_passwords_select_policy ON public.temporary_passwords
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS temporary_passwords_insert_policy ON public.temporary_passwords;
CREATE POLICY temporary_passwords_insert_policy ON public.temporary_passwords
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Update profiles RLS to allow admins to manage pending_approval
DROP POLICY IF EXISTS profiles_admin_update_policy ON public.profiles;
CREATE POLICY profiles_admin_update_policy ON public.profiles
  FOR UPDATE USING (
    id = auth.uid() OR  -- Users can update their own profile
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 7. Grant necessary permissions
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.temporary_passwords TO authenticated;

-- DOWN
-- Rollback migration: Remove admin system tables and columns

/*
-- Remove RLS policies
DROP POLICY IF EXISTS admin_audit_logs_select_policy ON public.admin_audit_logs;
DROP POLICY IF EXISTS system_settings_select_policy ON public.system_settings;
DROP POLICY IF EXISTS system_settings_modify_policy ON public.system_settings;
DROP POLICY IF EXISTS temporary_passwords_select_policy ON public.temporary_passwords;
DROP POLICY IF EXISTS temporary_passwords_insert_policy ON public.temporary_passwords;
DROP POLICY IF EXISTS profiles_admin_update_policy ON public.profiles;

-- Remove function
DROP FUNCTION IF EXISTS public.log_admin_action();

-- Drop tables
DROP TABLE IF EXISTS public.temporary_passwords;
DROP TABLE IF EXISTS public.system_settings;
DROP TABLE IF EXISTS public.admin_audit_logs;

-- Remove columns from profiles
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS pending_approval,
DROP COLUMN IF EXISTS approved_at,
DROP COLUMN IF EXISTS approved_by,
DROP COLUMN IF EXISTS account_created_by;
*/
