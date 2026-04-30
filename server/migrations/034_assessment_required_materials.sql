-- ============================================
-- Migration: 034_assessment_required_materials
-- Description: Per-assessment required learning materials. Teachers pick
--              which course materials gate which assessment, with an optional
--              minimum progress threshold per pair. An assignment is locked
--              for a student until every linked material reaches its
--              threshold (or completed=true) in material_progress.
--              `lm_gating_enabled` on assignments lets teachers turn the
--              gate off without dropping the configuration.
-- Dependencies: 001_initial_schema, 025_material_progress_and_submission_window
-- Author: MabiniLMS Team
-- Created: 2026-05-01
-- ============================================

-- UP

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS lm_gating_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assignments.lm_gating_enabled IS
    'When true, students cannot submit/start this assessment until every entry in assessment_required_materials reaches its min_progress_percent (or completed=true) for that student.';

CREATE TABLE IF NOT EXISTS public.assessment_required_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
    min_progress_percent NUMERIC(5,2) NOT NULL DEFAULT 100
        CHECK (min_progress_percent >= 0 AND min_progress_percent <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assessment_required_materials_unique
        UNIQUE (assignment_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_required_materials_assignment
    ON public.assessment_required_materials(assignment_id);

CREATE INDEX IF NOT EXISTS idx_assessment_required_materials_material
    ON public.assessment_required_materials(material_id);

ALTER TABLE public.assessment_required_materials ENABLE ROW LEVEL SECURITY;

-- Anyone who can already see the assignment (enrolled student or owning
-- teacher) can read its required-materials list. We piggyback on the
-- existing assignments visibility rules.
DROP POLICY IF EXISTS assessment_required_materials_select
    ON public.assessment_required_materials;
CREATE POLICY assessment_required_materials_select
    ON public.assessment_required_materials
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assessment_required_materials.assignment_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.enrollments e
                      WHERE e.course_id = c.id
                        AND e.student_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

-- Only the owning teacher (or admin) can edit the required-materials list.
DROP POLICY IF EXISTS assessment_required_materials_write
    ON public.assessment_required_materials;
CREATE POLICY assessment_required_materials_write
    ON public.assessment_required_materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assessment_required_materials.assignment_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assessment_required_materials.assignment_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.assessment_required_materials TO authenticated;

COMMENT ON TABLE public.assessment_required_materials IS
    'Required learning materials per assessment. Each row links one assignment to one material that must be completed (or reach min_progress_percent) before the student can submit/start.';

COMMENT ON COLUMN public.assessment_required_materials.min_progress_percent IS
    'Minimum progress_percent in material_progress that satisfies this requirement. 100 means must be marked complete.';

-- DOWN
-- DROP POLICY IF EXISTS assessment_required_materials_write ON public.assessment_required_materials;
-- DROP POLICY IF EXISTS assessment_required_materials_select ON public.assessment_required_materials;
-- DROP INDEX IF EXISTS idx_assessment_required_materials_material;
-- DROP INDEX IF EXISTS idx_assessment_required_materials_assignment;
-- DROP TABLE IF EXISTS public.assessment_required_materials CASCADE;
-- ALTER TABLE public.assignments DROP COLUMN IF EXISTS lm_gating_enabled;
