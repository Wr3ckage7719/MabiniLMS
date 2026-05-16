-- ============================================================
-- Migration 048: Security & Performance Hardening
-- ============================================================
-- Changes:
-- 1. Enable RLS on schema_migrations (was the only public table without it)
-- 2. Fix mutable search_path on all 10 public functions (schema injection risk)
-- 3. Revoke EXECUTE on callable SECURITY DEFINER functions from anon/authenticated
-- 4. Drop overly permissive USING(true) policies on token tables
-- 5. Tighten session_logs and user_audit_logs INSERT to self-only
-- 6. Remove over-broad notifications INSERT policy
-- 7. Add indexes for 7 unindexed foreign keys (performance)
-- 8. Backfill schema_migrations tracking for migrations 030-047
-- ============================================================

-- ─── 1. Enable RLS on schema_migrations ─────────────────────────────────────
-- No policies added; service_role (BYPASS RLS) is the only intended accessor.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- ─── 2. Fix mutable search_path on all public functions ─────────────────────
-- Prevents schema injection attacks where an adversary shadows functions/types
-- by creating objects in their own schema earlier in the search path.
ALTER FUNCTION public.set_lessons_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_profile_email() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_admin_action() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_log_profile_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_old_2fa_attempts() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_two_factor_auth_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_two_factor_enabled_flag() SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_enrollment_status_to_active() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_institutional_email(text) SET search_path = public, pg_temp;

-- ─── 3. Restrict EXECUTE on SECURITY DEFINER functions ──────────────────────
-- Must revoke from PUBLIC (the default grant) before selectively re-granting.
-- Revoking named roles alone is insufficient when a PUBLIC grant exists.

-- auto_log_profile_update: trigger-only, no user should call directly
REVOKE ALL ON FUNCTION public.auto_log_profile_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_log_profile_update() TO postgres, service_role;

-- cleanup_old_2fa_attempts: cron/maintenance only (returns void, callable via RPC)
REVOKE ALL ON FUNCTION public.cleanup_old_2fa_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_2fa_attempts() TO postgres, service_role;

-- handle_new_user: trigger-only (auth.users insert), no user should call directly
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- is_institutional_email: authenticated retained because validate_profile_email
-- (SECURITY INVOKER trigger) calls this on behalf of authenticated users.
REVOKE ALL ON FUNCTION public.is_institutional_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_institutional_email(text) TO postgres, authenticated, service_role;

-- ─── 4. Drop overly permissive token table policies ─────────────────────────
-- These policies applied to the 'public' (all) role with USING(true), meaning
-- any user could read or write every row in these sensitive tables.
-- Service_role bypasses RLS automatically — no replacement policy needed.
DROP POLICY IF EXISTS "Service role can manage verification tokens" ON public.email_verification_tokens;
DROP POLICY IF EXISTS "Service role can manage reset tokens" ON public.password_reset_tokens;

-- ─── 5. Tighten INSERT policies to prevent cross-user writes ─────────────────
-- session_logs: was WITH CHECK(true) for all roles — any user could forge
-- session log entries for any other user_id.
DROP POLICY IF EXISTS session_logs_insert_policy ON public.session_logs;
CREATE POLICY session_logs_insert_policy ON public.session_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- user_audit_logs: same issue. SECURITY DEFINER trigger and service_role
-- operations bypass RLS and are unaffected by this tightening.
DROP POLICY IF EXISTS user_audit_logs_insert ON public.user_audit_logs;
CREATE POLICY user_audit_logs_insert ON public.user_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─── 6. Remove overly permissive notifications INSERT policy ─────────────────
-- Applied to all roles with WITH CHECK(true): any user could push notifications
-- to any other user. Server notification creation uses service_role (bypasses RLS).
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- ─── 7. Indexes for unindexed foreign keys ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter_user_id
  ON public.bug_reports (reporter_user_id);

CREATE INDEX IF NOT EXISTS idx_bug_reports_resolved_by
  ON public.bug_reports (resolved_by);

CREATE INDEX IF NOT EXISTS idx_class_invitations_invited_by
  ON public.class_invitations (invited_by);

CREATE INDEX IF NOT EXISTS idx_grades_graded_by
  ON public.grades (graded_by);

CREATE INDEX IF NOT EXISTS idx_profiles_approved_by
  ON public.profiles (approved_by);

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by
  ON public.system_settings (updated_by);

CREATE INDEX IF NOT EXISTS idx_teacher_applications_approved_by
  ON public.teacher_applications (approved_by);

-- ─── 8. Backfill schema_migrations for previously applied migrations 030-047 ─
INSERT INTO public.schema_migrations (version, name, checksum, applied_at, applied_by, execution_time_ms)
VALUES
  ('030', 'short_answer_text',             '6ba9acaddb3abb5f0f53022e72fcb2eeaa3d496313eae99cf27990f914bc55fe', NOW(), 'migration_backfill', 0),
  ('031', 'enrollment_archive',            '360714144eb763e36939cbef7fba7d1bfd8f5782b706aea29ae43e49b6a265c4', NOW(), 'migration_backfill', 0),
  ('032', 'assignment_topics',             '920cda190965d44597a116c6a6bcb16f8261a9ff58eb9b911d13457763e5c82b', NOW(), 'migration_backfill', 0),
  ('033', 'course_lms_config',             '6d9b69b6f9aa7a38e5d0f371c0f626c556996ff6cdf8ac3ea0061a48de15d57a', NOW(), 'migration_backfill', 0),
  ('034', 'assessment_required_materials', '0f53435d17359decce7e0d17d323458d8aa2e943c8c647fc9c6e9144b84b757a', NOW(), 'migration_backfill', 0),
  ('035', 'offline_submission_columns',    '551e19c6ea2bf30af5ad9930f93ebeee472c008c1b16c5d939695568e067cce6', NOW(), 'migration_backfill', 0),
  ('036', 'tesda_competency_overlay',      'c9691a0bb2e96704c67a8307487f575f0e8ea7b49dd0c3b2803628658d9686ce', NOW(), 'migration_backfill', 0),
  ('037', 'lesson_centric_flow',           '819585f09ef16e0792efc36a0a84ff42a354c154616dc66f2f0e707ca15f1695', NOW(), 'migration_backfill', 0),
  ('038', 'lesson_general_backfill',       '6ac9070a324397ce175d18f9956b5038e35b0cc5ed20fe3c3afbde22a3068870', NOW(), 'migration_backfill', 0),
  ('039', 'material_page_count',           '3ef6bfde00f87b4c195ae1d0a29595df8d33411d8462ec11fdeac7845cece79f', NOW(), 'migration_backfill', 0),
  ('040', 'lesson_views',                  '67d079803a5d5e3aa4a4f84fde626ed98aaf6d91d814e961ffe1c157b24e7cf6', NOW(), 'migration_backfill', 0),
  ('041', 'lesson_builder_enhancements',   '49f217a71c87d5b68378204b995c860bd3e72a25c08d5b2a4eec135590e8e607', NOW(), 'migration_backfill', 0),
  ('042', 'notification_settings',         '0bcc2d0bbd3ca9f559cbb297bcc660579eba6e468b2825b4b52061539aee9041', NOW(), 'migration_backfill', 0),
  ('043', 'proctor_violations_extended',   '4f707253cc8fc327c081c885044ac08e4bf2ad52e380167f39df9719019d4a8c', NOW(), 'migration_backfill', 0),
  ('044', 'submissions_composite_indexes', 'ddd97a313cb3a618b6dd1910fceb136f7227ab9187e0b76719fd717659d06e84', NOW(), 'migration_backfill', 0),
  ('045', 'profiles_soft_delete',          'c45d04c108b710f0c0c408a4b6e6d274be313ab06acc66c7863c177d2221204a', NOW(), 'migration_backfill', 0),
  ('046', 'exam_question_images',          '6bb6c0c03086fc94b16a66a271ca47048a23c7332930318765b63e7692a30f76', NOW(), 'migration_backfill', 0),
  ('047', 'exam_question_types_extended',  '4d3a78845ea48a4ff5aea758c12a950cb91b923fa418656c4e30d99e3492c079', NOW(), 'migration_backfill', 0)
ON CONFLICT (version) DO NOTHING;
