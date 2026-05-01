-- ============================================
-- Migration: 037_lesson_centric_flow
-- Description: Flip the unit of progression from assessment-with-required-
--              materials to lesson-with-attached-assessments. A lesson owns
--              its files, completion rule, and downstream assessments;
--              chained lessons stay locked until the previous one is done.
--              Coexists with 034_assessment_required_materials — that table
--              stays as legacy and is no longer consulted for assignments
--              already linked to a published lesson (see 038 backfill).
-- Dependencies: 001_initial_schema, 025_material_progress_and_submission_window,
--               034_assessment_required_materials
-- Author: MabiniLMS Team
-- Created: 2026-05-01
-- ============================================

-- UP

CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT false,
    -- True for the auto-generated "General" lesson per course (see 038).
    -- General lessons never gate assessments; they exist purely to give
    -- legacy assignments and materials a home in the new model.
    is_general BOOLEAN NOT NULL DEFAULT false,
    completion_rule_type VARCHAR(40) NOT NULL DEFAULT 'mark_as_done'
        CHECK (completion_rule_type IN ('mark_as_done', 'view_all_files', 'time_on_material')),
    completion_rule_min_minutes INTEGER
        CHECK (completion_rule_min_minutes IS NULL OR completion_rule_min_minutes BETWEEN 1 AND 240),
    next_lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    unlock_on_submit BOOLEAN NOT NULL DEFAULT true,
    unlock_on_pass BOOLEAN NOT NULL DEFAULT false,
    pass_threshold_percent NUMERIC(5,2)
        CHECK (pass_threshold_percent IS NULL OR (pass_threshold_percent >= 0 AND pass_threshold_percent <= 100)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lessons_min_minutes_when_time_rule CHECK (
        completion_rule_type <> 'time_on_material'
        OR completion_rule_min_minutes IS NOT NULL
    ),
    CONSTRAINT lessons_chain_no_self_loop CHECK (next_lesson_id IS NULL OR next_lesson_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_sort
    ON public.lessons(course_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_lessons_next_lesson
    ON public.lessons(next_lesson_id)
    WHERE next_lesson_id IS NOT NULL;
-- Only one General lesson per course.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_one_general_per_course
    ON public.lessons(course_id)
    WHERE is_general = true;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lessons_select ON public.lessons;
CREATE POLICY lessons_select ON public.lessons
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = lessons.course_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
                  OR (
                      lessons.is_published = true
                      AND EXISTS (
                          SELECT 1 FROM public.enrollments e
                          WHERE e.course_id = c.id AND e.student_id = auth.uid()
                      )
                  )
              )
        )
    );

DROP POLICY IF EXISTS lessons_write ON public.lessons;
CREATE POLICY lessons_write ON public.lessons
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = lessons.course_id
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
            WHERE c.id = lessons.course_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;

-- ===== lesson_materials (lesson ↔ course_materials) =====
CREATE TABLE IF NOT EXISTS public.lesson_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lesson_materials_unique UNIQUE (lesson_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_materials_lesson
    ON public.lesson_materials(lesson_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lesson_materials_material
    ON public.lesson_materials(material_id);

ALTER TABLE public.lesson_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_materials_select ON public.lesson_materials;
CREATE POLICY lesson_materials_select ON public.lesson_materials
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_materials.lesson_id
              -- visibility check piggybacks on the lessons RLS — if the
              -- caller can read the lesson row, they can read its links.
        )
    );

DROP POLICY IF EXISTS lesson_materials_write ON public.lesson_materials;
CREATE POLICY lesson_materials_write ON public.lesson_materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_materials.lesson_id
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
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_materials.lesson_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_materials TO authenticated;

-- ===== lesson_assessments (lesson ↔ assignments) =====
CREATE TABLE IF NOT EXISTS public.lesson_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    is_optional BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- An assignment can only belong to one lesson at a time; the new mental
    -- model is "every assessment belongs to a lesson" (D6) so we enforce
    -- that here rather than at the application layer.
    CONSTRAINT lesson_assessments_unique_per_lesson UNIQUE (lesson_id, assignment_id),
    CONSTRAINT lesson_assessments_one_lesson_per_assignment UNIQUE (assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_assessments_lesson
    ON public.lesson_assessments(lesson_id, sort_order);

ALTER TABLE public.lesson_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_assessments_select ON public.lesson_assessments;
CREATE POLICY lesson_assessments_select ON public.lesson_assessments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_assessments.lesson_id
        )
    );

DROP POLICY IF EXISTS lesson_assessments_write ON public.lesson_assessments;
CREATE POLICY lesson_assessments_write ON public.lesson_assessments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_assessments.lesson_id
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
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_assessments.lesson_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_assessments TO authenticated;

-- ===== lesson_progress (per-student "marked done" state) =====
CREATE TABLE IF NOT EXISTS public.lesson_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    marked_done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lesson_progress_unique UNIQUE (lesson_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson
    ON public.lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student
    ON public.lesson_progress(student_id);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_progress_select ON public.lesson_progress;
CREATE POLICY lesson_progress_select ON public.lesson_progress
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_progress.lesson_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

-- Students can only insert their own progress rows; teachers/admins can't
-- mark a lesson done on a student's behalf.
DROP POLICY IF EXISTS lesson_progress_insert ON public.lesson_progress;
CREATE POLICY lesson_progress_insert ON public.lesson_progress
    FOR INSERT
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS lesson_progress_update ON public.lesson_progress;
CREATE POLICY lesson_progress_update ON public.lesson_progress
    FOR UPDATE
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS lesson_progress_delete ON public.lesson_progress;
CREATE POLICY lesson_progress_delete ON public.lesson_progress
    FOR DELETE
    USING (student_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;

-- updated_at touch trigger.
CREATE OR REPLACE FUNCTION public.set_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lessons_set_updated_at ON public.lessons;
CREATE TRIGGER lessons_set_updated_at
    BEFORE UPDATE ON public.lessons
    FOR EACH ROW
    EXECUTE FUNCTION public.set_lessons_updated_at();

DROP TRIGGER IF EXISTS lesson_progress_set_updated_at ON public.lesson_progress;
CREATE TRIGGER lesson_progress_set_updated_at
    BEFORE UPDATE ON public.lesson_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.set_lessons_updated_at();

COMMENT ON TABLE public.lessons IS
    'Unit of progression in the LM-centric flow. Owns files (via lesson_materials) and assessments (via lesson_assessments). Chained lessons unlock sequentially.';

COMMENT ON COLUMN public.lessons.is_general IS
    'Auto-generated catch-all lesson per course. Holds legacy assignments and materials that pre-date the lesson model. Never gates assessments.';

COMMENT ON COLUMN public.lessons.next_lesson_id IS
    'Strict-linear chain target (D9). null = no successor.';

COMMENT ON TABLE public.lesson_assessments IS
    'Binds an assignment to exactly one lesson. The unique constraint enforces D6: every assessment belongs to a lesson.';

COMMENT ON TABLE public.lesson_progress IS
    'Per-student mark-as-done state. The presence of a row means the student has completed the lesson; assessment unlock follows.';

-- DOWN
-- DROP TRIGGER IF EXISTS lesson_progress_set_updated_at ON public.lesson_progress;
-- DROP TRIGGER IF EXISTS lessons_set_updated_at ON public.lessons;
-- DROP FUNCTION IF EXISTS public.set_lessons_updated_at();
-- DROP TABLE IF EXISTS public.lesson_progress CASCADE;
-- DROP TABLE IF EXISTS public.lesson_assessments CASCADE;
-- DROP TABLE IF EXISTS public.lesson_materials CASCADE;
-- DROP TABLE IF EXISTS public.lessons CASCADE;
