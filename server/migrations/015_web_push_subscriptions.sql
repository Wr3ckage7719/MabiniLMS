-- ============================================
-- Migration: 015_web_push_subscriptions
-- Description: Add Web Push subscription storage for browser/device notifications
-- Dependencies: 003_notifications
-- Author: MabiniLMS Team
-- Created: 2026-04-13
-- ============================================

-- UP
-- Apply migration: Create push_subscriptions table and policies

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time TIMESTAMPTZ,
    user_agent TEXT,
    platform TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON public.push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
    ON public.push_subscriptions(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used_at
    ON public.push_subscriptions(last_used_at DESC NULLS LAST);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update ON public.push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

COMMENT ON TABLE public.push_subscriptions IS 'Browser and device push subscriptions for Web Push delivery';

-- DOWN
-- Rollback migration: Drop push_subscriptions table

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;

DROP INDEX IF EXISTS idx_push_subscriptions_user_id;
DROP INDEX IF EXISTS idx_push_subscriptions_user_active;
DROP INDEX IF EXISTS idx_push_subscriptions_last_used_at;

DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
