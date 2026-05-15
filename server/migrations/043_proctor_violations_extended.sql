-- ============================================
-- Migration: 043_proctor_violations_extended
-- Description: Extend the exam_violations.violation_type CHECK constraint
--              with four additional violation types captured by the hardened
--              client-side proctoring. Existing rows are unaffected.
-- Dependencies: 013_proctored_exam_pipeline
-- Author: MabiniLMS Team
-- Created: 2026-05-15
-- ============================================

-- UP

ALTER TABLE public.exam_violations
    DROP CONSTRAINT IF EXISTS exam_violations_violation_type_check;

ALTER TABLE public.exam_violations
    ADD CONSTRAINT exam_violations_violation_type_check
        CHECK (violation_type IN (
            'visibility_hidden',
            'fullscreen_exit',
            'context_menu',
            'copy',
            'paste',
            'cut',
            'print_shortcut',
            'devtools_open',
            'wake_lock_released',
            'screen_orientation_change',
            'network_offline',
            'picture_in_picture'
        ));

-- DOWN
-- ALTER TABLE public.exam_violations DROP CONSTRAINT IF EXISTS exam_violations_violation_type_check;
-- ALTER TABLE public.exam_violations ADD CONSTRAINT exam_violations_violation_type_check
--     CHECK (violation_type IN (
--         'visibility_hidden','fullscreen_exit','context_menu','copy','paste',
--         'cut','print_shortcut','devtools_open'
--     ));
