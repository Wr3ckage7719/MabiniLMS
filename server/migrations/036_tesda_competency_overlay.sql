-- ============================================
-- Migration: 036_tesda_competency_overlay
-- Description: Lightweight TESDA competency overlay (D2b path). Each course
--              can declare a small number of Units of Competency. Each unit
--              points at the existing assignments / materials that count as
--              evidence. A student's status per unit is derived live from
--              their existing grades + material progress, so we don't have
--              to backfill anything for legacy data.
-- Dependencies: 001_initial_schema, 025_material_progress_and_submission_window
-- Author: MabiniLMS Team
-- Created: 2026-05-01
-- ============================================

-- UP

CREATE TABLE IF NOT EXISTS public.competency_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    code VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    -- Percentage of the total weighted evidence the student must clear to be
    -- declared Competent. Defaults to 75 to match TESDA's typical pass mark.
    threshold_percent NUMERIC(5,2) NOT NULL DEFAULT 75
        CHECK (threshold_percent >= 0 AND threshold_percent <= 100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competency_units_unique_code_per_course UNIQUE (course_id, code)
);

CREATE INDEX IF NOT EXISTS idx_competency_units_course
    ON public.competency_units(course_id);

ALTER TABLE public.competency_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS competency_units_select ON public.competency_units;
CREATE POLICY competency_units_select ON public.competency_units
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = competency_units.course_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.enrollments e
                      WHERE e.course_id = c.id AND e.student_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

DROP POLICY IF EXISTS competency_units_write ON public.competency_units;
CREATE POLICY competency_units_write ON public.competency_units
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = competency_units.course_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = competency_units.course_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competency_units TO authenticated;

CREATE TABLE IF NOT EXISTS public.competency_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES public.competency_units(id) ON DELETE CASCADE,
    -- Exactly one of assignment_id / material_id is set per row. Modelling
    -- both columns as nullable + a CHECK lets a single table cover graded and
    -- non-graded evidence without a polymorphic column.
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.course_materials(id) ON DELETE CASCADE,
    -- Relative weight of this evidence within the unit. Used to compute the
    -- weighted percentage the student has cleared.
    weight NUMERIC(6,2) NOT NULL DEFAULT 1
        CHECK (weight > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competency_evidence_one_artifact CHECK (
        (assignment_id IS NOT NULL AND material_id IS NULL)
        OR (assignment_id IS NULL AND material_id IS NOT NULL)
    ),
    CONSTRAINT competency_evidence_unique_assignment
        UNIQUE (unit_id, assignment_id),
    CONSTRAINT competency_evidence_unique_material
        UNIQUE (unit_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_competency_evidence_unit
    ON public.competency_evidence(unit_id);
CREATE INDEX IF NOT EXISTS idx_competency_evidence_assignment
    ON public.competency_evidence(assignment_id)
    WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competency_evidence_material
    ON public.competency_evidence(material_id)
    WHERE material_id IS NOT NULL;

ALTER TABLE public.competency_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS competency_evidence_select ON public.competency_evidence;
CREATE POLICY competency_evidence_select ON public.competency_evidence
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.competency_units u
            JOIN public.courses c ON c.id = u.course_id
            WHERE u.id = competency_evidence.unit_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.enrollments e
                      WHERE e.course_id = c.id AND e.student_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

DROP POLICY IF EXISTS competency_evidence_write ON public.competency_evidence;
CREATE POLICY competency_evidence_write ON public.competency_evidence
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.competency_units u
            JOIN public.courses c ON c.id = u.course_id
            WHERE u.id = competency_evidence.unit_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.competency_units u
            JOIN public.courses c ON c.id = u.course_id
            WHERE u.id = competency_evidence.unit_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.competency_evidence TO authenticated;

COMMENT ON TABLE public.competency_units IS
    'Lightweight TESDA Units of Competency declared per course. Status per student is derived live from existing grades and material progress.';

COMMENT ON TABLE public.competency_evidence IS
    'Links a competency unit to existing assignments or learning materials that count toward demonstrating the unit.';

-- DOWN
-- DROP POLICY IF EXISTS competency_evidence_write ON public.competency_evidence;
-- DROP POLICY IF EXISTS competency_evidence_select ON public.competency_evidence;
-- DROP TABLE IF EXISTS public.competency_evidence CASCADE;
-- DROP POLICY IF EXISTS competency_units_write ON public.competency_units;
-- DROP POLICY IF EXISTS competency_units_select ON public.competency_units;
-- DROP TABLE IF EXISTS public.competency_units CASCADE;
