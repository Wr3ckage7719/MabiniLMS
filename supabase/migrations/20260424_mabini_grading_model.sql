-- Mabini Colleges Grading Model Migration
-- Adds grading_period column and expands assignment_type to support all
-- five Mabini period components: exam (Major Exam), quiz, recitation, attendance, project.

-- 1. Add grading_period column to assignments
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS grading_period TEXT
    CHECK (grading_period IN ('pre_mid', 'midterm', 'pre_final', 'final'));

-- 2. Extend the assignment_type check constraint to include new Mabini types.
--    First drop the existing check (if named), then re-add with full list.
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_assignment_type_check;

ALTER TABLE assignments
  ADD CONSTRAINT assignments_assignment_type_check
    CHECK (assignment_type IN ('exam', 'quiz', 'activity', 'recitation', 'attendance', 'project'));

-- 3. Index for fast period-based grouping in registrar export
CREATE INDEX IF NOT EXISTS idx_assignments_grading_period
  ON assignments (course_id, grading_period);

-- 4. Index for fast type-based grouping
CREATE INDEX IF NOT EXISTS idx_assignments_course_type
  ON assignments (course_id, assignment_type);
