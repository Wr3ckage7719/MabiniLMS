-- MabiniLMS Database Schema for Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/bwzqqifuwqpzfvauwgqq/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users/Profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    syllabus TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enrollments table
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'completed')),
    UNIQUE(course_id, student_id)
);

-- Assignments table
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    max_points INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE public.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'late')),
    UNIQUE(assignment_id, student_id)
);

-- Grades table
CREATE TABLE public.grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    points_earned DECIMAL(5,2),
    feedback TEXT,
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Course materials table
CREATE TABLE public.course_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('pdf', 'video', 'document', 'link')),
    file_url TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_courses_teacher ON public.courses(teacher_id);
CREATE INDEX idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX idx_assignments_course ON public.assignments(course_id);
CREATE INDEX idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX idx_submissions_student ON public.submissions(student_id);
CREATE INDEX idx_grades_submission ON public.grades(submission_id);
CREATE INDEX idx_materials_course ON public.course_materials(course_id);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for courses
CREATE POLICY "Anyone can view published courses" ON public.courses
    FOR SELECT USING (status = 'published' OR teacher_id = auth.uid());

CREATE POLICY "Teachers can create courses" ON public.courses
    FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own courses" ON public.courses
    FOR UPDATE USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own courses" ON public.courses
    FOR DELETE USING (teacher_id = auth.uid());

-- RLS Policies for enrollments
CREATE POLICY "Users can view own enrollments" ON public.enrollments
    FOR SELECT USING (student_id = auth.uid() OR 
        course_id IN (SELECT id FROM public.courses WHERE teacher_id = auth.uid()));

CREATE POLICY "Students can enroll in courses" ON public.enrollments
    FOR INSERT WITH CHECK (student_id = auth.uid());

-- RLS Policies for assignments
CREATE POLICY "Enrolled users can view assignments" ON public.assignments
    FOR SELECT USING (
        course_id IN (
            SELECT course_id FROM public.enrollments WHERE student_id = auth.uid()
        ) OR 
        course_id IN (
            SELECT id FROM public.courses WHERE teacher_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can manage assignments" ON public.assignments
    FOR ALL USING (
        course_id IN (SELECT id FROM public.courses WHERE teacher_id = auth.uid())
    );

-- RLS Policies for submissions
CREATE POLICY "Users can view own submissions" ON public.submissions
    FOR SELECT USING (
        student_id = auth.uid() OR
        assignment_id IN (
            SELECT id FROM public.assignments WHERE course_id IN (
                SELECT id FROM public.courses WHERE teacher_id = auth.uid()
            )
        )
    );

CREATE POLICY "Students can submit assignments" ON public.submissions
    FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own submissions" ON public.submissions
    FOR UPDATE USING (student_id = auth.uid());

-- RLS Policies for grades
CREATE POLICY "Users can view own grades" ON public.grades
    FOR SELECT USING (
        submission_id IN (SELECT id FROM public.submissions WHERE student_id = auth.uid()) OR
        graded_by = auth.uid()
    );

CREATE POLICY "Teachers can manage grades" ON public.grades
    FOR ALL USING (
        submission_id IN (
            SELECT s.id FROM public.submissions s
            JOIN public.assignments a ON s.assignment_id = a.id
            JOIN public.courses c ON a.course_id = c.id
            WHERE c.teacher_id = auth.uid()
        )
    );

-- RLS Policies for course materials
CREATE POLICY "Enrolled users can view materials" ON public.course_materials
    FOR SELECT USING (
        course_id IN (
            SELECT course_id FROM public.enrollments WHERE student_id = auth.uid()
        ) OR 
        course_id IN (
            SELECT id FROM public.courses WHERE teacher_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can manage materials" ON public.course_materials
    FOR ALL USING (
        course_id IN (SELECT id FROM public.courses WHERE teacher_id = auth.uid())
    );

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'Name'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'student')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on new user
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
