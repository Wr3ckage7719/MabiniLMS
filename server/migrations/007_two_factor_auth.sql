-- filepath: d:\MabiniLMS\server\migrations\007_two_factor_auth.sql
-- ============================================
-- Migration: 007_two_factor_auth
-- Description: Add two-factor authentication (2FA) support
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-07
-- ============================================

-- UP
-- Apply migration: Add 2FA tables and columns

-- 1. Create two_factor_auth table for storing 2FA secrets
CREATE TABLE IF NOT EXISTS public.two_factor_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT[] NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for 2FA queries
CREATE INDEX IF NOT EXISTS idx_two_factor_auth_user_id 
  ON public.two_factor_auth(user_id);

CREATE INDEX IF NOT EXISTS idx_two_factor_auth_enabled 
  ON public.two_factor_auth(is_enabled) WHERE is_enabled = TRUE;

COMMENT ON TABLE public.two_factor_auth IS 'Stores 2FA secrets and backup codes for users';
COMMENT ON COLUMN public.two_factor_auth.secret IS 'Encrypted TOTP secret key';
COMMENT ON COLUMN public.two_factor_auth.backup_codes IS 'Array of hashed backup codes (one-time use)';
COMMENT ON COLUMN public.two_factor_auth.is_enabled IS 'Whether 2FA is currently active for this user';
COMMENT ON COLUMN public.two_factor_auth.enabled_at IS 'Timestamp when 2FA was first enabled';

-- 2. Create 2FA verification attempts table (for rate limiting)
CREATE TABLE IF NOT EXISTS public.two_factor_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for 2FA attempt queries
CREATE INDEX IF NOT EXISTS idx_two_factor_attempts_user_id 
  ON public.two_factor_attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_two_factor_attempts_ip_address 
  ON public.two_factor_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_two_factor_attempts_created_at 
  ON public.two_factor_attempts(created_at DESC);

COMMENT ON TABLE public.two_factor_attempts IS 'Tracks 2FA verification attempts for rate limiting and security monitoring';

-- 3. Add 2FA columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_required BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.two_factor_enabled IS 'Indicates if user has 2FA enabled';
COMMENT ON COLUMN public.profiles.two_factor_required IS 'Admin flag to require 2FA for this user';

-- 4. Function to clean up old 2FA attempts (30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_2fa_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM public.two_factor_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_old_2fa_attempts() IS 'Removes 2FA attempt records older than 30 days';

-- 5. Update trigger for two_factor_auth
CREATE OR REPLACE FUNCTION public.update_two_factor_auth_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_two_factor_auth_timestamp ON public.two_factor_auth;
CREATE TRIGGER update_two_factor_auth_timestamp
  BEFORE UPDATE ON public.two_factor_auth
  FOR EACH ROW
  EXECUTE FUNCTION public.update_two_factor_auth_timestamp();

-- 6. Sync two_factor_enabled flag with two_factor_auth table
CREATE OR REPLACE FUNCTION public.sync_two_factor_enabled_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- When 2FA is enabled, update profile flag
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.profiles
    SET two_factor_enabled = NEW.is_enabled
    WHERE id = NEW.user_id;
    
    -- Set enabled_at timestamp on first enable
    IF NEW.is_enabled = TRUE AND OLD.is_enabled = FALSE THEN
      NEW.enabled_at = NOW();
    END IF;
  END IF;
  
  -- When 2FA record is deleted, update profile flag
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET two_factor_enabled = FALSE
    WHERE id = OLD.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_two_factor_enabled_flag ON public.two_factor_auth;
CREATE TRIGGER sync_two_factor_enabled_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.two_factor_auth
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_two_factor_enabled_flag();

-- 7. RLS Policies for two_factor_auth table

-- Enable RLS
ALTER TABLE public.two_factor_auth ENABLE ROW LEVEL SECURITY;

-- Users can only view/modify their own 2FA settings
DROP POLICY IF EXISTS two_factor_auth_select_policy ON public.two_factor_auth;
CREATE POLICY two_factor_auth_select_policy ON public.two_factor_auth
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS two_factor_auth_insert_policy ON public.two_factor_auth;
CREATE POLICY two_factor_auth_insert_policy ON public.two_factor_auth
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS two_factor_auth_update_policy ON public.two_factor_auth;
CREATE POLICY two_factor_auth_update_policy ON public.two_factor_auth
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS two_factor_auth_delete_policy ON public.two_factor_auth;
CREATE POLICY two_factor_auth_delete_policy ON public.two_factor_auth
  FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 8. RLS Policies for two_factor_attempts table

-- Enable RLS
ALTER TABLE public.two_factor_attempts ENABLE ROW LEVEL SECURITY;

-- Users can view their own attempts, admins can view all
DROP POLICY IF EXISTS two_factor_attempts_select_policy ON public.two_factor_attempts;
CREATE POLICY two_factor_attempts_select_policy ON public.two_factor_attempts
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only the system can insert attempts (no user INSERT policy)
DROP POLICY IF EXISTS two_factor_attempts_insert_policy ON public.two_factor_attempts;
CREATE POLICY two_factor_attempts_insert_policy ON public.two_factor_attempts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 9. Grant permissions
GRANT ALL ON public.two_factor_auth TO authenticated;
GRANT ALL ON public.two_factor_attempts TO authenticated;

-- DOWN
-- Rollback migration: Remove 2FA tables and columns

/*
-- Remove triggers
DROP TRIGGER IF EXISTS sync_two_factor_enabled_flag ON public.two_factor_auth;
DROP TRIGGER IF EXISTS update_two_factor_auth_timestamp ON public.two_factor_auth;

-- Remove functions
DROP FUNCTION IF EXISTS public.sync_two_factor_enabled_flag();
DROP FUNCTION IF EXISTS public.update_two_factor_auth_timestamp();
DROP FUNCTION IF EXISTS public.cleanup_old_2fa_attempts();

-- Remove policies
DROP POLICY IF EXISTS two_factor_auth_select_policy ON public.two_factor_auth;
DROP POLICY IF EXISTS two_factor_auth_insert_policy ON public.two_factor_auth;
DROP POLICY IF EXISTS two_factor_auth_update_policy ON public.two_factor_auth;
DROP POLICY IF EXISTS two_factor_auth_delete_policy ON public.two_factor_auth;
DROP POLICY IF EXISTS two_factor_attempts_select_policy ON public.two_factor_attempts;
DROP POLICY IF EXISTS two_factor_attempts_insert_policy ON public.two_factor_attempts;

-- Drop tables
DROP TABLE IF EXISTS public.two_factor_attempts;
DROP TABLE IF EXISTS public.two_factor_auth;

-- Remove columns from profiles
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS two_factor_enabled,
DROP COLUMN IF EXISTS two_factor_required;
*/
