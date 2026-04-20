-- ============================================
-- Migration: 027_submission_storage_provider_metadata
-- Description: Add provider-backed immutable snapshot metadata for assignment submissions
-- Dependencies: 012_submission_status_pipeline
-- Author: MabiniLMS Team
-- Created: 2026-04-21
-- ============================================

-- UP
-- Apply migration: Add provider metadata columns for hybrid submission storage support

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(40),
  ADD COLUMN IF NOT EXISTS provider_file_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_revision_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS provider_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS provider_checksum TEXT,
  ADD COLUMN IF NOT EXISTS submission_snapshot_at TIMESTAMPTZ;

UPDATE public.submissions
SET
  storage_provider = COALESCE(NULLIF(storage_provider, ''), 'google_drive'),
  provider_file_id = COALESCE(provider_file_id, drive_file_id),
  submission_snapshot_at = COALESCE(submission_snapshot_at, submitted_at::timestamptz, NOW())
WHERE
  storage_provider IS NULL
  OR storage_provider = ''
  OR provider_file_id IS NULL
  OR submission_snapshot_at IS NULL;

ALTER TABLE public.submissions
  ALTER COLUMN storage_provider SET DEFAULT 'google_drive';

UPDATE public.submissions
SET storage_provider = 'google_drive'
WHERE storage_provider IS NULL OR storage_provider = '';

ALTER TABLE public.submissions
  ALTER COLUMN storage_provider SET NOT NULL;

ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS submissions_storage_provider_check;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_storage_provider_check
  CHECK (storage_provider IN ('google_drive'));

CREATE INDEX IF NOT EXISTS idx_submissions_storage_provider
  ON public.submissions(storage_provider);

CREATE INDEX IF NOT EXISTS idx_submissions_provider_file
  ON public.submissions(provider_file_id)
  WHERE provider_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_snapshot_at
  ON public.submissions(submission_snapshot_at DESC)
  WHERE submission_snapshot_at IS NOT NULL;

COMMENT ON COLUMN public.submissions.storage_provider IS
  'Logical storage provider used to store submission artifacts (google_drive for this phase).';

COMMENT ON COLUMN public.submissions.provider_file_id IS
  'Provider-native immutable file identifier used as canonical submission artifact reference.';

COMMENT ON COLUMN public.submissions.provider_revision_id IS
  'Provider-native revision/version identifier captured at submission time.';

COMMENT ON COLUMN public.submissions.provider_mime_type IS
  'Provider-reported MIME type captured when the submission was finalized.';

COMMENT ON COLUMN public.submissions.provider_size_bytes IS
  'Provider-reported file size in bytes captured at submission time.';

COMMENT ON COLUMN public.submissions.provider_checksum IS
  'Provider-reported checksum hash (when available) captured at submission time.';

COMMENT ON COLUMN public.submissions.submission_snapshot_at IS
  'Timestamp when the provider metadata snapshot was captured for grading/audit immutability.';

-- DOWN
-- Rollback migration: Remove provider metadata columns and indexes

DROP INDEX IF EXISTS idx_submissions_snapshot_at;
DROP INDEX IF EXISTS idx_submissions_provider_file;
DROP INDEX IF EXISTS idx_submissions_storage_provider;

ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS submissions_storage_provider_check;

ALTER TABLE public.submissions
  DROP COLUMN IF EXISTS submission_snapshot_at,
  DROP COLUMN IF EXISTS provider_checksum,
  DROP COLUMN IF EXISTS provider_size_bytes,
  DROP COLUMN IF EXISTS provider_mime_type,
  DROP COLUMN IF EXISTS provider_revision_id,
  DROP COLUMN IF EXISTS provider_file_id,
  DROP COLUMN IF EXISTS storage_provider;
