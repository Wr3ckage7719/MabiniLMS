-- Migration: 014_course_discussions
-- Description: Add persistent course discussion posts and likes for class stream.

-- ============================================
-- Course Discussion Posts
-- ============================================

CREATE TABLE IF NOT EXISTS public.course_discussion_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_discussion_posts_course_id
    ON public.course_discussion_posts(course_id);
CREATE INDEX IF NOT EXISTS idx_course_discussion_posts_author_id
    ON public.course_discussion_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_course_discussion_posts_created_at
    ON public.course_discussion_posts(created_at DESC);

ALTER TABLE public.course_discussion_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_discussion_posts_select ON public.course_discussion_posts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_id AND c.teacher_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1
            FROM public.enrollments e
            WHERE e.course_id = course_id
            AND e.student_id = auth.uid()
            AND e.status = 'active'
        )
    );

CREATE POLICY course_discussion_posts_insert ON public.course_discussion_posts
    FOR INSERT
    WITH CHECK (
        auth.uid() = author_id AND (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'
            ) OR
            EXISTS (
                SELECT 1 FROM public.courses c
                WHERE c.id = course_id AND c.teacher_id = auth.uid()
            ) OR
            EXISTS (
                SELECT 1
                FROM public.enrollments e
                WHERE e.course_id = course_id
                AND e.student_id = auth.uid()
                AND e.status = 'active'
            )
        )
    );

CREATE POLICY course_discussion_posts_update ON public.course_discussion_posts
    FOR UPDATE
    USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_id AND c.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_id AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY course_discussion_posts_delete ON public.course_discussion_posts
    FOR DELETE
    USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_id AND c.teacher_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_discussion_posts TO authenticated;

-- ============================================
-- Discussion Post Likes
-- ============================================

CREATE TABLE IF NOT EXISTS public.course_discussion_post_likes (
    post_id UUID NOT NULL REFERENCES public.course_discussion_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_discussion_post_likes_post_id
    ON public.course_discussion_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_course_discussion_post_likes_user_id
    ON public.course_discussion_post_likes(user_id);

ALTER TABLE public.course_discussion_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_discussion_post_likes_select ON public.course_discussion_post_likes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.course_discussion_posts p
            JOIN public.courses c ON c.id = p.course_id
            WHERE p.id = post_id
            AND (
                c.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles pr
                    WHERE pr.id = auth.uid() AND pr.role = 'admin'
                ) OR
                EXISTS (
                    SELECT 1
                    FROM public.enrollments e
                    WHERE e.course_id = p.course_id
                    AND e.student_id = auth.uid()
                    AND e.status = 'active'
                )
            )
        )
    );

CREATE POLICY course_discussion_post_likes_insert ON public.course_discussion_post_likes
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1
            FROM public.course_discussion_posts p
            JOIN public.courses c ON c.id = p.course_id
            WHERE p.id = post_id
            AND (
                c.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles pr
                    WHERE pr.id = auth.uid() AND pr.role = 'admin'
                ) OR
                EXISTS (
                    SELECT 1
                    FROM public.enrollments e
                    WHERE e.course_id = p.course_id
                    AND e.student_id = auth.uid()
                    AND e.status = 'active'
                )
            )
        )
    );

CREATE POLICY course_discussion_post_likes_delete ON public.course_discussion_post_likes
    FOR DELETE
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1
            FROM public.course_discussion_posts p
            JOIN public.courses c ON c.id = p.course_id
            WHERE p.id = post_id
            AND (
                c.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles pr
                    WHERE pr.id = auth.uid() AND pr.role = 'admin'
                )
            )
        )
    );

GRANT SELECT, INSERT, DELETE ON public.course_discussion_post_likes TO authenticated;
