-- Fix self-referencing bug in exam_violations INSERT policy.
-- The original had `ea.assignment_id = ea.assignment_id` (always true),
-- so it never verified that the violation's assignment_id matches the attempt.
DROP POLICY IF EXISTS exam_violations_insert ON public.exam_violations;

CREATE POLICY exam_violations_insert ON public.exam_violations
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM exam_attempts ea
      WHERE ea.id = exam_violations.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.assignment_id = exam_violations.assignment_id
        AND ea.status = 'active'
    )
  );
