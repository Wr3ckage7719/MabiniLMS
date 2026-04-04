-- ============================================
-- Email Verification & Password Reset Tables
-- Migration: 002_email_verification
-- Description: Create email verification and password reset token tables
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-03
-- ============================================

-- UP
-- Apply migration: Create verification tables and update profiles

-- Email verification tokens table
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add email_verified columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON public.email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON public.email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON public.email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON public.password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON public.password_reset_tokens(expires_at);

-- Row level security for tokens
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Policies for email verification tokens
CREATE POLICY "Users can view own verification tokens" ON public.email_verification_tokens
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access to verification tokens" ON public.email_verification_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for password reset tokens
CREATE POLICY "Users can view own reset tokens" ON public.password_reset_tokens
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access to reset tokens" ON public.password_reset_tokens
    FOR ALL USING (auth.role() = 'service_role');


-- DOWN
-- Rollback migration: Remove verification tables and columns

-- Drop policies
DROP POLICY IF EXISTS "Users can view own verification tokens" ON public.email_verification_tokens;
DROP POLICY IF EXISTS "Service role full access to verification tokens" ON public.email_verification_tokens;
DROP POLICY IF EXISTS "Users can view own reset tokens" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Service role full access to reset tokens" ON public.password_reset_tokens;

-- Drop indexes
DROP INDEX IF EXISTS idx_email_verification_tokens_user_id;
DROP INDEX IF EXISTS idx_email_verification_tokens_token;
DROP INDEX IF EXISTS idx_email_verification_tokens_expires_at;
DROP INDEX IF EXISTS idx_password_reset_tokens_user_id;
DROP INDEX IF EXISTS idx_password_reset_tokens_token;
DROP INDEX IF EXISTS idx_password_reset_tokens_expires_at;

-- Drop tables
DROP TABLE IF EXISTS public.email_verification_tokens CASCADE;
DROP TABLE IF EXISTS public.password_reset_tokens CASCADE;

-- Remove columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email_verified;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email_verified_at;
