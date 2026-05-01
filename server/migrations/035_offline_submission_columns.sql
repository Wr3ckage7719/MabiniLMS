-- ============================================
-- Migration: 035_offline_submission_columns
-- Description: Persist the device-side timestamp for offline-buffered
--              submissions and a flag teachers can use to triage work that
--              was submitted offline before the close time but only synced
--              afterwards. Pairs with 011_submission_sync_idempotency.
-- Dependencies: 001_initial_schema, 011_submission_sync_idempotency
-- Author: MabiniLMS Team
-- Created: 2026-05-01
-- ============================================

-- UP

ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS client_submitted_at TIMESTAMPTZ;

ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS submitted_after_close BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.submissions.client_submitted_at IS
    'Device-side timestamp captured when the student tapped Submit. Set when the submission was buffered offline and replayed by the sync engine; null for live submissions.';

COMMENT ON COLUMN public.submissions.submitted_after_close IS
    'True when the submission was buffered offline before the assignment close time but the server only received it after close. Surfaced to teachers for review; the submission is still accepted.';

CREATE INDEX IF NOT EXISTS idx_submissions_submitted_after_close
    ON public.submissions(submitted_after_close)
    WHERE submitted_after_close = true;

-- DOWN
-- DROP INDEX IF EXISTS idx_submissions_submitted_after_close;
-- ALTER TABLE public.submissions DROP COLUMN IF EXISTS submitted_after_close;
-- ALTER TABLE public.submissions DROP COLUMN IF EXISTS client_submitted_at;
