-- ============================================
-- Migration: 012_submission_status_pipeline
-- Description: Expand submission statuses and add immutable submission status history
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-11
-- ============================================

-- UP
-- Apply migration: Add LMS-006 submission pipeline support

ALTER TABLE public.submissions
    DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE public.submissions
    ADD CONSTRAINT submissions_status_check
    CHECK (status IN ('draft', 'submitted', 'late', 'under_review', 'graded'));

CREATE TABLE IF NOT EXISTS public.submission_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    from_status VARCHAR(20) CHECK (from_status IN ('draft', 'submitted', 'late', 'under_review', 'graded')),
    to_status VARCHAR(20) NOT NULL CHECK (to_status IN ('draft', 'submitted', 'late', 'under_review', 'graded')),
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_status_history_submission_id
    ON public.submission_status_history(submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_status_history_created_at
    ON public.submission_status_history(created_at);

CREATE INDEX IF NOT EXISTS idx_submission_status_history_changed_by
    ON public.submission_status_history(changed_by);

ALTER TABLE public.submission_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY submission_status_history_select ON public.submission_status_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.submissions s
            JOIN public.assignments a ON a.id = s.assignment_id
            JOIN public.courses c ON c.id = a.course_id
            WHERE s.id = submission_id
              AND (
                  s.student_id = auth.uid()
                  OR c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

CREATE POLICY submission_status_history_insert ON public.submission_status_history
    FOR INSERT
    WITH CHECK (
        changed_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.submissions s
            JOIN public.assignments a ON a.id = s.assignment_id
            JOIN public.courses c ON c.id = a.course_id
            WHERE s.id = submission_id
              AND (
                  s.student_id = auth.uid()
                  OR c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT ON public.submission_status_history TO authenticated;

COMMENT ON TABLE public.submission_status_history IS
    'Immutable timeline of submission status transitions for LMS-006 workflow auditing.';

INSERT INTO public.submission_status_history (
    submission_id,
    from_status,
    to_status,
    changed_by,
    reason,
    metadata,
    created_at
)
SELECT
    s.id,
    NULL,
    s.status,
    NULL,
    'Initial status snapshot for LMS-006 migration',
    jsonb_build_object('source', 'migration_012'),
    COALESCE(s.submitted_at, NOW())
FROM public.submissions s
WHERE NOT EXISTS (
    SELECT 1
    FROM public.submission_status_history h
    WHERE h.submission_id = s.id
);

-- DOWN
-- Rollback migration: Remove LMS-006 submission pipeline support

DROP POLICY IF EXISTS submission_status_history_insert ON public.submission_status_history;
DROP POLICY IF EXISTS submission_status_history_select ON public.submission_status_history;

DROP INDEX IF EXISTS idx_submission_status_history_changed_by;
DROP INDEX IF EXISTS idx_submission_status_history_created_at;
DROP INDEX IF EXISTS idx_submission_status_history_submission_id;

DROP TABLE IF EXISTS public.submission_status_history CASCADE;

ALTER TABLE public.submissions
    DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE public.submissions
    ADD CONSTRAINT submissions_status_check
    CHECK (status IN ('submitted', 'graded', 'late'));
