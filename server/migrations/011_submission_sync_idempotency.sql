-- ============================================
-- Migration: 011_submission_sync_idempotency
-- Description: Add sync-key tracking for idempotent offline submission replay
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-11
-- ============================================

-- UP
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

-- DOWN
-- Rollback migration: Drop submission sync event tracking table

DROP INDEX IF EXISTS idx_submission_sync_events_submission_id;
DROP INDEX IF EXISTS idx_submission_sync_events_assignment_id;
DROP INDEX IF EXISTS idx_submission_sync_events_student_sync_key;
DROP TABLE IF EXISTS public.submission_sync_events CASCADE;
