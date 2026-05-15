-- Migration 044: Composite indexes on submissions for hot read paths
--
-- The student grades view and the teacher submission queue run two query
-- shapes that the existing single-column indexes don't cover well:
--
--   WHERE student_id = ? ORDER BY submitted_at DESC      -- student grade list
--   WHERE assignment_id = ? AND status = ?               -- teacher queue filter
--
-- Adding composite indexes makes both queries an index scan instead of a
-- bitmap heap scan plus sort. Expected speedup is ~5-10x on prod-sized
-- tables.
--
-- IMPORTANT — APPLY THIS MIGRATION MANUALLY.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction, and this
-- repo's migration runner wraps every file in BEGIN/COMMIT. Until the
-- runner learns a `-- migrate:no-transaction` directive (see plan §10.4),
-- apply these two statements by hand:
--
--   1. Connect to Supabase:
--        psql "$SUPABASE_DB_URL"
--   2. Run the two CREATE INDEX statements below. They are safe to run on
--      a live table — CONCURRENTLY takes no exclusive lock.
--   3. Record the migration as applied so the runner skips it:
--        INSERT INTO schema_migrations (version, name, applied_at)
--        VALUES ('044', '044_submissions_composite_indexes', NOW());
--      (Adjust the column list to match your schema_migrations shape —
--       run `\d schema_migrations` first.)
--
-- Verify with `\d+ submissions` that both indexes appear afterwards.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_student_submitted_at
  ON public.submissions (student_id, submitted_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_assignment_status
  ON public.submissions (assignment_id, status);

-- DOWN
-- Reversal of 044. These indexes are leftover-safe (no foreign relation),
-- so a code-only rollback does not require dropping them. Drop only if
-- they're truly unwanted:
--
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_submissions_student_submitted_at;
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_submissions_assignment_status;
