-- ============================================
-- ADD MISSING FEATURES TO EXISTING DATABASE
-- Only run these if you already have the core tables
-- ============================================

-- ============================================
-- PART 1: Email Verification Tables
-- ============================================

-- Add email_verified columns to existing profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
  
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Email verification tokens table
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id 
  ON public.email_verification_tokens(user_id);
  
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token 
  ON public.email_verification_tokens(token);
  
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
  ON public.password_reset_tokens(user_id);
  
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token 
  ON public.password_reset_tokens(token);

-- Row level security
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Policies (with IF NOT EXISTS pattern)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'email_verification_tokens' 
    AND policyname = 'Users can view own verification tokens'
  ) THEN
    CREATE POLICY "Users can view own verification tokens" 
      ON public.email_verification_tokens FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'email_verification_tokens' 
    AND policyname = 'Service role can manage verification tokens'
  ) THEN
    CREATE POLICY "Service role can manage verification tokens" 
      ON public.email_verification_tokens FOR ALL
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'password_reset_tokens' 
    AND policyname = 'Service role can manage reset tokens'
  ) THEN
    CREATE POLICY "Service role can manage reset tokens" 
      ON public.password_reset_tokens FOR ALL
      USING (true);
  END IF;
END $$;

-- ============================================
-- PART 2: Notifications Table
-- ============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  action_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
  ON public.notifications(user_id);
  
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON public.notifications(user_id, read);
  
CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON public.notifications(created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_notifications_type 
  ON public.notifications(type);

-- Row level security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies (with IF NOT EXISTS pattern)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'notifications' 
    AND policyname = 'Users can view own notifications'
  ) THEN
    CREATE POLICY "Users can view own notifications"
      ON public.notifications FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'notifications' 
    AND policyname = 'Users can update own notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications"
      ON public.notifications FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'notifications' 
    AND policyname = 'Service role can insert notifications'
  ) THEN
    CREATE POLICY "Service role can insert notifications"
      ON public.notifications FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'notifications' 
    AND policyname = 'Users can delete own notifications'
  ) THEN
    CREATE POLICY "Users can delete own notifications"
      ON public.notifications FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================

-- Check all tables exist
SELECT 
  'Database setup complete! Found ' || COUNT(*) || ' tables' AS status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
