-- Migration 041: Lesson builder enhancements
-- Adds:
--   1. view_all_and_submit completion rule type
--   2. unlock_delay_hours to lessons (paced release after completion)
--   3. is_optional column on lesson_materials (per-material optional flag)

-- ─── 1. Add view_all_and_submit completion rule type ─────────────────────────
-- The lessons table uses an inline (unnamed) CHECK on completion_rule_type.
-- We find its system-generated name and replace it with a named version that
-- includes the new rule type.

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'lessons'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%completion_rule_type%'
    AND pg_get_constraintdef(c.oid) NOT LIKE '%view_all_and_submit%';

  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lessons DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_completion_rule_type_check
  CHECK (completion_rule_type IN (
    'mark_as_done',
    'view_all_files',
    'time_on_material',
    'view_all_and_submit'
  ));

-- ─── 2. Unlock delay ─────────────────────────────────────────────────────────
-- Number of hours after this lesson is marked done before the next lesson
-- unlocks. NULL (default) means immediate unlock. Maximum 7 days (168 h).

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS unlock_delay_hours INTEGER DEFAULT NULL
  CONSTRAINT lessons_unlock_delay_hours_check
  CHECK (unlock_delay_hours IS NULL OR (unlock_delay_hours >= 0 AND unlock_delay_hours <= 168));

-- ─── 3. Per-material optional flag ───────────────────────────────────────────
-- When true the material is shown but not counted toward view_all_files /
-- view_all_and_submit completion. Defaults to false (all materials required).

ALTER TABLE public.lesson_materials
  ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false;

-- DOWN
-- Reversal of 041. Comments are deliberate — copy and run by hand against the
-- target environment only after taking a backup. Dropping the is_optional or
-- unlock_delay_hours columns will lose any teacher-configured values.
--
-- ALTER TABLE public.lesson_materials DROP COLUMN IF EXISTS is_optional;
--
-- ALTER TABLE public.lessons DROP COLUMN IF EXISTS unlock_delay_hours;
--
-- DO $$
-- DECLARE cname text;
-- BEGIN
--   SELECT conname INTO cname FROM pg_constraint c
--   JOIN pg_class t ON c.conrelid = t.oid
--   WHERE t.relname = 'lessons'
--     AND c.contype = 'c'
--     AND pg_get_constraintdef(c.oid) ILIKE '%completion_rule_type%';
--   IF cname IS NOT NULL THEN
--     EXECUTE 'ALTER TABLE public.lessons DROP CONSTRAINT ' || quote_ident(cname);
--   END IF;
-- END $$;
--
-- ALTER TABLE public.lessons
--   ADD CONSTRAINT lessons_completion_rule_type_check
--   CHECK (completion_rule_type IN (
--     'mark_as_done',
--     'view_all_files',
--     'time_on_material',
--     'view_all_and_submit'
--   ));
