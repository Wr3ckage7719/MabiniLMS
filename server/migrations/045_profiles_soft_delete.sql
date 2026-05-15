-- Migration 045: Soft-delete column on profiles
--
-- Hard-deleting a profile cascades through ten downstream tables
-- (submissions, grades, exam_attempts, lesson_progress, audit logs, etc.).
-- One misclick in the admin "delete user" flow erases a semester's worth
-- of work with no undo.
--
-- This migration adds a non-destructive column. The application layer
-- (see services/admin.ts:deleteManagedUser) will set deleted_at instead
-- of issuing DELETE; the actual DELETE remains available as an admin-
-- only hard-delete path guarded by typed-name confirmation.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index keeps listings fast — most queries care only about active rows.
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NULL;

-- DOWN
-- Reversal of 045. The column is additive, so dropping it is safe — but if
-- anything has been soft-deleted, dropping the column loses that information.
-- Comments are commented out so a casual migrate:down can't lose data.
--
-- DROP INDEX IF EXISTS public.idx_profiles_deleted_at;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS deleted_at;
