-- ============================================
-- MabiniLMS Pending Migrations Bundle
-- Generated: 2026-04-10T18:02:43.301Z
-- Run this in Supabase SQL Editor as one script.
-- ============================================

-- --------------------------------------------
-- Migration 011_submission_sync_idempotency
-- --------------------------------------------
-- Apply migration: Create submission sync event tracking table

CREATE TABLE IF NOT EXISTS public.submission_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    sync_key VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_sync_events_student_sync_key
    ON public.submission_sync_events(student_id, sync_key);

CREATE INDEX IF NOT EXISTS idx_submission_sync_events_assignment_id
    ON public.submission_sync_events(assignment_id);

CREATE INDEX IF NOT EXISTS idx_submission_sync_events_submission_id
    ON public.submission_sync_events(submission_id);

ALTER TABLE public.submission_sync_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.submission_sync_events IS
    'Tracks processed submission sync keys to guarantee idempotent offline replay.';

COMMENT ON COLUMN public.submission_sync_events.sync_key IS
    'Client-generated sync key used for submission replay deduplication.';

INSERT INTO public.schema_migrations (version, name, checksum, applied_by, execution_time_ms)
VALUES ('011', 'submission_sync_idempotency', 'b79ef8ec02b60a44bbd6776ed0ed55a79fac28f79555b2a872b463ca7dd56a0b', 'manual_bundle', 0)
ON CONFLICT (version) DO UPDATE
SET
  name = EXCLUDED.name,
  checksum = EXCLUDED.checksum,
  applied_by = EXCLUDED.applied_by,
  applied_at = CURRENT_TIMESTAMP;
