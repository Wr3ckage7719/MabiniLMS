-- ============================================
-- Migration: 025_material_progress_and_submission_window
-- Description: Add reading progress tracking and assignment submission window controls
-- Dependencies: 001_initial_schema, 013_proctored_exam_pipeline
-- Author: MabiniLMS Team
-- Created: 2026-04-18
-- ============================================

-- UP
-- Apply migration: Add assignment submission controls and material progress tracking

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS submissions_open BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS submission_open_at TIMESTAMPTZ;

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS submission_close_at TIMESTAMPTZ;

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_submission_window_check;

ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_submission_window_check
    CHECK (
        submission_open_at IS NULL
        OR submission_close_at IS NULL
        OR submission_close_at >= submission_open_at
    );

CREATE INDEX IF NOT EXISTS idx_assignments_submissions_open
    ON public.assignments(submissions_open);

CREATE INDEX IF NOT EXISTS idx_assignments_submission_close_at
    ON public.assignments(submission_close_at);

CREATE TABLE IF NOT EXISTS public.material_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (progress_percent >= 0 AND progress_percent <= 100),
    completed BOOLEAN NOT NULL DEFAULT false,
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT material_progress_unique_material_user UNIQUE (material_id, user_id),
    CONSTRAINT material_progress_completion_consistency CHECK (
        (completed = true AND completed_at IS NOT NULL)
        OR (completed = false AND completed_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_material_progress_material_id
    ON public.material_progress(material_id);

CREATE INDEX IF NOT EXISTS idx_material_progress_user_id
    ON public.material_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_material_progress_course_id
    ON public.material_progress(course_id);

CREATE INDEX IF NOT EXISTS idx_material_progress_updated_at
    ON public.material_progress(updated_at DESC);

ALTER TABLE public.material_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_progress_select ON public.material_progress;
CREATE POLICY material_progress_select ON public.material_progress
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.courses c
            WHERE c.id = course_id
              AND c.teacher_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

DROP POLICY IF EXISTS material_progress_insert ON public.material_progress;
CREATE POLICY material_progress_insert ON public.material_progress
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.enrollments e
            WHERE e.course_id = material_progress.course_id
              AND e.student_id = auth.uid()
              AND e.status IN ('active', 'enrolled')
        )
    );

DROP POLICY IF EXISTS material_progress_update ON public.material_progress;
CREATE POLICY material_progress_update ON public.material_progress
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.enrollments e
            WHERE e.course_id = material_progress.course_id
              AND e.student_id = auth.uid()
              AND e.status IN ('active', 'enrolled')
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.enrollments e
            WHERE e.course_id = material_progress.course_id
              AND e.student_id = auth.uid()
              AND e.status IN ('active', 'enrolled')
        )
    );

GRANT SELECT, INSERT, UPDATE ON public.material_progress TO authenticated;

COMMENT ON TABLE public.material_progress IS
    'Tracks per-student reading progress for course materials.';

COMMENT ON COLUMN public.assignments.submissions_open IS
    'Whether students can currently submit work for this assignment.';

COMMENT ON COLUMN public.assignments.submission_open_at IS
    'Optional timestamp when submissions become available.';

COMMENT ON COLUMN public.assignments.submission_close_at IS
    'Optional timestamp when submissions are closed.';

COMMENT ON COLUMN public.material_progress.progress_percent IS
    'Student progress percentage for the material (0-100).';

COMMENT ON COLUMN public.material_progress.last_viewed_at IS
    'Last time the student viewed the material.';

-- DOWN
-- Rollback migration: Remove submission window controls and material progress tracking

DROP POLICY IF EXISTS material_progress_update ON public.material_progress;
DROP POLICY IF EXISTS material_progress_insert ON public.material_progress;
DROP POLICY IF EXISTS material_progress_select ON public.material_progress;

DROP INDEX IF EXISTS idx_material_progress_updated_at;
DROP INDEX IF EXISTS idx_material_progress_course_id;
DROP INDEX IF EXISTS idx_material_progress_user_id;
DROP INDEX IF EXISTS idx_material_progress_material_id;

DROP TABLE IF EXISTS public.material_progress CASCADE;

DROP INDEX IF EXISTS idx_assignments_submission_close_at;
DROP INDEX IF EXISTS idx_assignments_submissions_open;

ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_submission_window_check;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS submission_close_at;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS submission_open_at;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS submissions_open;
