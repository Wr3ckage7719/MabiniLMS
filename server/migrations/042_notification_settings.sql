-- ============================================
-- Migration: 042_notification_settings
-- Description: Per-user notification preferences and reminder send log
-- Dependencies: 001_initial_schema, 003_notifications
-- Author: MabiniLMS Team
-- Created: 2026-05-14
-- ============================================

-- UP
-- Apply migration: persist user notification preferences so Settings toggles
-- (email, push, due-date reminders) actually drive backend behaviour.

CREATE TABLE IF NOT EXISTS public.notification_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    due_date_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    due_date_reminder_lead_hours INTEGER NOT NULL DEFAULT 24
        CHECK (due_date_reminder_lead_hours BETWEEN 1 AND 168),
    type_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_settings_select_own ON public.notification_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notification_settings_insert_own ON public.notification_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY notification_settings_update_own ON public.notification_settings
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;

CREATE TRIGGER trg_notification_settings_updated_at
    BEFORE UPDATE ON public.notification_settings
    FOR EACH ROW EXECUTE FUNCTION public.touch_notification_settings_updated_at();

COMMENT ON TABLE public.notification_settings IS
    'Per-user notification preferences. Backend gates email/push/in-app sends on these toggles.';

-- Idempotency record for reminder dispatch (24h-before-deadline + future kinds).
CREATE TABLE IF NOT EXISTS public.assignment_reminder_log (
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reminder_kind VARCHAR(40) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assignment_id, user_id, reminder_kind)
);

CREATE INDEX IF NOT EXISTS idx_assignment_reminder_log_user
    ON public.assignment_reminder_log(user_id);

CREATE INDEX IF NOT EXISTS idx_assignment_reminder_log_assignment
    ON public.assignment_reminder_log(assignment_id);

ALTER TABLE public.assignment_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY assignment_reminder_log_select_own ON public.assignment_reminder_log
    FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.assignment_reminder_log TO authenticated;

COMMENT ON TABLE public.assignment_reminder_log IS
    'Records each (assignment, user, kind) reminder dispatch so the scheduler is idempotent.';

-- DOWN
-- Rollback migration

DROP POLICY IF EXISTS assignment_reminder_log_select_own ON public.assignment_reminder_log;
DROP INDEX IF EXISTS idx_assignment_reminder_log_assignment;
DROP INDEX IF EXISTS idx_assignment_reminder_log_user;
DROP TABLE IF EXISTS public.assignment_reminder_log;

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
DROP FUNCTION IF EXISTS public.touch_notification_settings_updated_at();
DROP POLICY IF EXISTS notification_settings_update_own ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_insert_own ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_select_own ON public.notification_settings;
DROP TABLE IF EXISTS public.notification_settings;
