-- ============================================
-- Migration: 013_proctored_exam_pipeline
-- Description: Add proctored exam attempts, violations, and deterministic question randomization
-- Dependencies: 001_initial_schema, 012_submission_status_pipeline
-- Author: MabiniLMS Team
-- Created: 2026-04-11
-- ============================================

-- UP
-- Apply migration: Add LMS-010, LMS-011, LMS-012 exam proctoring pipeline

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS is_proctored BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS exam_duration_minutes INTEGER
    CHECK (exam_duration_minutes IS NULL OR exam_duration_minutes BETWEEN 5 AND 300);

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS proctoring_policy JSONB NOT NULL DEFAULT
    '{"max_violations":3,"terminate_on_fullscreen_exit":false,"block_clipboard":true,"block_context_menu":true,"block_print_shortcut":true}'::jsonb;

CREATE TABLE IF NOT EXISTS public.exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    choices JSONB NOT NULL,
    correct_choice_index INTEGER NOT NULL,
    points NUMERIC(6,2) NOT NULL DEFAULT 1,
    explanation TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exam_questions_choices_array_check
        CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) BETWEEN 2 AND 10),
    CONSTRAINT exam_questions_correct_choice_index_check
        CHECK (correct_choice_index >= 0 AND correct_choice_index < jsonb_array_length(choices)),
    CONSTRAINT exam_questions_points_check
        CHECK (points > 0)
);

CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'submitted', 'terminated', 'timed_out')),
    seed BIGINT NOT NULL,
    rendered_question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
    rendered_choice_orders JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exam_attempts_rendered_question_order_check
        CHECK (jsonb_typeof(rendered_question_order) = 'array'),
    CONSTRAINT exam_attempts_rendered_choice_orders_check
        CHECK (jsonb_typeof(rendered_choice_orders) = 'object')
);

CREATE TABLE IF NOT EXISTS public.exam_attempt_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    selected_choice_index INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    points_awarded NUMERIC(6,2) NOT NULL DEFAULT 0,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exam_attempt_answers_unique UNIQUE (attempt_id, question_id),
    CONSTRAINT exam_attempt_answers_points_awarded_check CHECK (points_awarded >= 0)
);

CREATE TABLE IF NOT EXISTS public.exam_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    violation_type VARCHAR(40) NOT NULL
        CHECK (violation_type IN (
            'visibility_hidden',
            'fullscreen_exit',
            'context_menu',
            'copy',
            'paste',
            'cut',
            'print_shortcut',
            'devtools_open'
        )),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exam_violations_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_assignment_id
    ON public.exam_questions(assignment_id);

CREATE INDEX IF NOT EXISTS idx_exam_questions_order_index
    ON public.exam_questions(assignment_id, order_index);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_assignment_id
    ON public.exam_attempts(assignment_id);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_id
    ON public.exam_attempts(student_id);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_status
    ON public.exam_attempts(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_unique_active
    ON public.exam_attempts(assignment_id, student_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt_id
    ON public.exam_attempt_answers(attempt_id);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_question_id
    ON public.exam_attempt_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_exam_violations_attempt_id
    ON public.exam_violations(attempt_id);

CREATE INDEX IF NOT EXISTS idx_exam_violations_assignment_id
    ON public.exam_violations(assignment_id);

CREATE INDEX IF NOT EXISTS idx_exam_violations_student_id
    ON public.exam_violations(student_id);

CREATE INDEX IF NOT EXISTS idx_exam_violations_created_at
    ON public.exam_violations(created_at);

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_questions_select ON public.exam_questions;
CREATE POLICY exam_questions_select ON public.exam_questions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
              AND (
                  c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.enrollments e
                      WHERE e.course_id = c.id
                        AND e.student_id = auth.uid()
                        AND e.status = 'active'
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

DROP POLICY IF EXISTS exam_questions_manage ON public.exam_questions;
CREATE POLICY exam_questions_manage ON public.exam_questions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
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
            WHERE a.id = assignment_id
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

DROP POLICY IF EXISTS exam_attempts_select ON public.exam_attempts;
CREATE POLICY exam_attempts_select ON public.exam_attempts
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
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

DROP POLICY IF EXISTS exam_attempts_insert ON public.exam_attempts;
CREATE POLICY exam_attempts_insert ON public.exam_attempts
    FOR INSERT
    WITH CHECK (
        student_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.enrollments e ON e.course_id = a.course_id
            WHERE a.id = assignment_id
                            AND COALESCE(
                                        to_jsonb(a)->>'assignment_type',
                                        to_jsonb(a)->>'type',
                                        to_jsonb(a)->>'raw_type'
                                    ) = 'exam'
              AND e.student_id = auth.uid()
              AND e.status = 'active'
        )
    );

DROP POLICY IF EXISTS exam_attempts_update ON public.exam_attempts;
CREATE POLICY exam_attempts_update ON public.exam_attempts
    FOR UPDATE
    USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
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
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
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

DROP POLICY IF EXISTS exam_attempt_answers_select ON public.exam_attempt_answers;
CREATE POLICY exam_attempt_answers_select ON public.exam_attempt_answers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.exam_attempts ea
            JOIN public.assignments a ON a.id = ea.assignment_id
            JOIN public.courses c ON c.id = a.course_id
            WHERE ea.id = attempt_id
              AND (
                  ea.student_id = auth.uid()
                  OR c.teacher_id = auth.uid()
                  OR EXISTS (
                      SELECT 1
                      FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'
                  )
              )
        )
    );

DROP POLICY IF EXISTS exam_attempt_answers_upsert ON public.exam_attempt_answers;
CREATE POLICY exam_attempt_answers_upsert ON public.exam_attempt_answers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.exam_attempts ea
            WHERE ea.id = attempt_id
              AND ea.student_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.exam_attempts ea
            WHERE ea.id = attempt_id
              AND ea.student_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS exam_violations_select ON public.exam_violations;
CREATE POLICY exam_violations_select ON public.exam_violations
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
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

DROP POLICY IF EXISTS exam_violations_insert ON public.exam_violations;
CREATE POLICY exam_violations_insert ON public.exam_violations
    FOR INSERT
    WITH CHECK (
        student_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.exam_attempts ea
            WHERE ea.id = attempt_id
              AND ea.student_id = auth.uid()
              AND ea.assignment_id = assignment_id
              AND ea.status = 'active'
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempt_answers TO authenticated;
GRANT SELECT, INSERT ON public.exam_violations TO authenticated;

COMMENT ON TABLE public.exam_questions IS
    'Question bank for exam assignments used in deterministic per-attempt randomization.';

COMMENT ON TABLE public.exam_attempts IS
    'Student exam attempt sessions with deterministic shuffle seed and rendered order snapshots.';

COMMENT ON TABLE public.exam_attempt_answers IS
    'Per-question answers captured during exam attempts.';

COMMENT ON TABLE public.exam_violations IS
    'Proctoring and interaction-restriction violations captured during active exam attempts.';

-- DOWN
-- Rollback migration: Remove exam proctoring pipeline

DROP POLICY IF EXISTS exam_violations_insert ON public.exam_violations;
DROP POLICY IF EXISTS exam_violations_select ON public.exam_violations;

DROP POLICY IF EXISTS exam_attempt_answers_upsert ON public.exam_attempt_answers;
DROP POLICY IF EXISTS exam_attempt_answers_select ON public.exam_attempt_answers;

DROP POLICY IF EXISTS exam_attempts_update ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_insert ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_select ON public.exam_attempts;

DROP POLICY IF EXISTS exam_questions_manage ON public.exam_questions;
DROP POLICY IF EXISTS exam_questions_select ON public.exam_questions;

DROP INDEX IF EXISTS idx_exam_violations_created_at;
DROP INDEX IF EXISTS idx_exam_violations_student_id;
DROP INDEX IF EXISTS idx_exam_violations_assignment_id;
DROP INDEX IF EXISTS idx_exam_violations_attempt_id;

DROP INDEX IF EXISTS idx_exam_attempt_answers_question_id;
DROP INDEX IF EXISTS idx_exam_attempt_answers_attempt_id;

DROP INDEX IF EXISTS idx_exam_attempts_unique_active;
DROP INDEX IF EXISTS idx_exam_attempts_status;
DROP INDEX IF EXISTS idx_exam_attempts_student_id;
DROP INDEX IF EXISTS idx_exam_attempts_assignment_id;

DROP INDEX IF EXISTS idx_exam_questions_order_index;
DROP INDEX IF EXISTS idx_exam_questions_assignment_id;

DROP TABLE IF EXISTS public.exam_violations CASCADE;
DROP TABLE IF EXISTS public.exam_attempt_answers CASCADE;
DROP TABLE IF EXISTS public.exam_attempts CASCADE;
DROP TABLE IF EXISTS public.exam_questions CASCADE;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS proctoring_policy;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS exam_duration_minutes;

ALTER TABLE public.assignments
    DROP COLUMN IF EXISTS is_proctored;
