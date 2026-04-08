-- Migration: 008_announcements
-- Description: Add announcements table for course announcements

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_announcements_course_id ON announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(course_id, pinned DESC, created_at DESC);

-- Enable Row Level Security
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Teachers and admins can create announcements for their courses
CREATE POLICY announcements_insert_teacher ON announcements
    FOR INSERT
    WITH CHECK (
        auth.uid() = author_id AND (
            EXISTS (
                SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
            ) OR
            EXISTS (
                SELECT 1 FROM courses WHERE id = course_id AND teacher_id = auth.uid()
            )
        )
    );

-- Anyone enrolled in the course or the teacher can view announcements
CREATE POLICY announcements_select ON announcements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        ) OR
        EXISTS (
            SELECT 1 FROM courses WHERE id = course_id AND teacher_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM enrollments 
            WHERE course_id = announcements.course_id 
            AND student_id = auth.uid() 
            AND status = 'active'
        )
    );

-- Teachers and admins can update announcements
CREATE POLICY announcements_update ON announcements
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        ) OR
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM courses WHERE id = course_id AND teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        ) OR
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM courses WHERE id = course_id AND teacher_id = auth.uid()
        )
    );

-- Teachers and admins can delete announcements
CREATE POLICY announcements_delete ON announcements
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        ) OR
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM courses WHERE id = course_id AND teacher_id = auth.uid()
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO authenticated;
