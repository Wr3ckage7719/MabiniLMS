-- ============================================
-- Migration: 017_announcement_comments
-- Description: Add announcement comments table with course-member access controls
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-14
-- ============================================

-- UP
-- Apply migration: Create announcement comments table and access policies.

CREATE TABLE IF NOT EXISTS public.announcement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcement_comments_announcement_id
  ON public.announcement_comments(announcement_id);

CREATE INDEX IF NOT EXISTS idx_announcement_comments_author_id
  ON public.announcement_comments(author_id);

CREATE INDEX IF NOT EXISTS idx_announcement_comments_created_at
  ON public.announcement_comments(created_at);

ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_comments_select ON public.announcement_comments;
CREATE POLICY announcement_comments_select ON public.announcement_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.announcements a
      JOIN public.courses c ON c.id = a.course_id
      WHERE a.id = announcement_id
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

DROP POLICY IF EXISTS announcement_comments_insert ON public.announcement_comments;
CREATE POLICY announcement_comments_insert ON public.announcement_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1
      FROM public.announcements a
      JOIN public.courses c ON c.id = a.course_id
      WHERE a.id = announcement_id
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

GRANT SELECT, INSERT ON public.announcement_comments TO authenticated;

-- DOWN
-- Rollback migration: Drop announcement comments table and related policies.

REVOKE SELECT, INSERT ON public.announcement_comments FROM authenticated;

DROP POLICY IF EXISTS announcement_comments_insert ON public.announcement_comments;
DROP POLICY IF EXISTS announcement_comments_select ON public.announcement_comments;

DROP INDEX IF EXISTS idx_announcement_comments_created_at;
DROP INDEX IF EXISTS idx_announcement_comments_author_id;
DROP INDEX IF EXISTS idx_announcement_comments_announcement_id;

DROP TABLE IF EXISTS public.announcement_comments CASCADE;
