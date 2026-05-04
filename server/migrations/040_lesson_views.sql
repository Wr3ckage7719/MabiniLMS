-- ============================================
-- Migration: 040_lesson_views
-- Description: Track per-student lesson opens so teachers can see who has
--              actually opened each lesson (distinct from `lesson_progress`,
--              which only fires when a student explicitly marks a lesson as
--              done). Powers the Lesson Views matrix in the teacher class
--              insights panel.
-- Dependencies: 037_lesson_centric_flow
-- Author: MabiniLMS Team
-- Created: 2026-05-04
-- ============================================

-- UP

CREATE TABLE IF NOT EXISTS public.lesson_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lesson_views_unique UNIQUE (lesson_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_views_lesson
    ON public.lesson_views(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_views_student
    ON public.lesson_views(student_id);

ALTER TABLE public.lesson_views ENABLE ROW LEVEL SECURITY;

-- Students can read their own view rows. Teachers/admins can read every row
-- for lessons in courses they own (used by the Lesson Views matrix).
DROP POLICY IF EXISTS lesson_views_select ON public.lesson_views;
CREATE POLICY lesson_views_select ON public.lesson_views
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_views.lesson_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

-- Students can only insert their own view rows; teachers must not be able to
-- forge views on a student's behalf.
DROP POLICY IF EXISTS lesson_views_insert ON public.lesson_views;
CREATE POLICY lesson_views_insert ON public.lesson_views
    FOR INSERT
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS lesson_views_update ON public.lesson_views;
CREATE POLICY lesson_views_update ON public.lesson_views
    FOR UPDATE
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS lesson_views_delete ON public.lesson_views;
CREATE POLICY lesson_views_delete ON public.lesson_views
    FOR DELETE
    USING (student_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_views TO authenticated;

-- updated_at touch trigger reuses the function defined in 037.
DROP TRIGGER IF EXISTS lesson_views_set_updated_at ON public.lesson_views;
CREATE TRIGGER lesson_views_set_updated_at
    BEFORE UPDATE ON public.lesson_views
    FOR EACH ROW
    EXECUTE FUNCTION public.set_lessons_updated_at();

COMMENT ON TABLE public.lesson_views IS
    'Per-student lesson open log. A row exists once a student has opened a lesson at least once; view_count and last_viewed_at update on every subsequent open.';

-- DOWN
-- DROP TRIGGER IF EXISTS lesson_views_set_updated_at ON public.lesson_views;
-- DROP TABLE IF EXISTS public.lesson_views CASCADE;
