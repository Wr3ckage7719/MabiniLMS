-- Migration: 010_invitations_and_assignment_comments
-- Description: Add class invitations and assignment comments support
-- Dependencies: 001_initial_schema

-- ============================================
-- Class Invitations
-- ============================================

CREATE TABLE IF NOT EXISTS public.class_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_email VARCHAR(255) NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_invitations_course_id
    ON public.class_invitations(course_id);
CREATE INDEX IF NOT EXISTS idx_class_invitations_student_email
    ON public.class_invitations(student_email);
CREATE INDEX IF NOT EXISTS idx_class_invitations_student_id
    ON public.class_invitations(student_id);
CREATE INDEX IF NOT EXISTS idx_class_invitations_status
    ON public.class_invitations(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_invitations_course_email_pending
    ON public.class_invitations(course_id, student_email)
    WHERE status = 'pending';

ALTER TABLE public.class_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY class_invitations_teacher_insert ON public.class_invitations
    FOR INSERT
    WITH CHECK (
        auth.uid() = invited_by AND (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'admin'
            ) OR
            EXISTS (
                SELECT 1 FROM public.courses
                WHERE id = course_id AND teacher_id = auth.uid()
            )
        )
    );

CREATE POLICY class_invitations_select ON public.class_invitations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = course_id AND teacher_id = auth.uid()
        ) OR
        student_id = auth.uid() OR
        lower(student_email) = (
            SELECT lower(email) FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY class_invitations_update_status ON public.class_invitations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        ) OR
        student_id = auth.uid() OR
        lower(student_email) = (
            SELECT lower(email) FROM public.profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        ) OR
        student_id = auth.uid() OR
        lower(student_email) = (
            SELECT lower(email) FROM public.profiles WHERE id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE ON public.class_invitations TO authenticated;

-- ============================================
-- Assignment Comments
-- ============================================

CREATE TABLE IF NOT EXISTS public.assignment_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_comments_assignment_id
    ON public.assignment_comments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_comments_author_id
    ON public.assignment_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_assignment_comments_created_at
    ON public.assignment_comments(created_at);

ALTER TABLE public.assignment_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY assignment_comments_insert ON public.assignment_comments
    FOR INSERT
    WITH CHECK (
        auth.uid() = author_id AND (
            EXISTS (
                SELECT 1
                FROM public.assignments a
                JOIN public.courses c ON c.id = a.course_id
                WHERE a.id = assignment_id
                AND (
                    c.teacher_id = auth.uid() OR
                    EXISTS (
                        SELECT 1 FROM public.profiles p
                        WHERE p.id = auth.uid() AND p.role = 'admin'
                    ) OR
                    EXISTS (
                        SELECT 1
                        FROM public.enrollments e
                        WHERE e.course_id = a.course_id
                        AND e.student_id = auth.uid()
                        AND e.status = 'active'
                    )
                )
            )
        )
    );

CREATE POLICY assignment_comments_select ON public.assignment_comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.courses c ON c.id = a.course_id
            WHERE a.id = assignment_id
            AND (
                c.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.role = 'admin'
                ) OR
                EXISTS (
                    SELECT 1
                    FROM public.enrollments e
                    WHERE e.course_id = a.course_id
                    AND e.student_id = auth.uid()
                    AND e.status = 'active'
                )
            )
        )
    );

GRANT SELECT, INSERT ON public.assignment_comments TO authenticated;
