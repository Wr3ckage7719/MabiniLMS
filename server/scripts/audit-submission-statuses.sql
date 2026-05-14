-- ============================================
-- Submission Status Audit
--
-- Run these read-only queries to confirm that the stored `submissions.status`
-- column agrees with the assignment's due date. Expected: zero rows.
--
-- 1) Rows tagged 'submitted' that were actually past due at submit time.
--    These should have been recorded as 'late' but weren't.
--
-- 2) Rows tagged 'late' that were actually on time. These should be
--    'submitted'. (Less common — usually points to a clock drift bug or a
--    teacher-driven manual override.)
--
-- 3) Drafts older than the due date — these students never turned anything
--    in. We treat them as derived "overdue" / "missed" at read time and do
--    NOT relabel them in the DB. This query is informational only.
--
-- Usage:
--   psql $DATABASE_URL -f server/scripts/audit-submission-statuses.sql
--   -- or paste into Supabase SQL editor
-- ============================================

-- 1) Mislabeled "submitted" (should be late)
SELECT
    'mislabeled_as_submitted'   AS issue,
    s.id                        AS submission_id,
    s.assignment_id,
    s.student_id,
    s.status,
    s.submitted_at,
    a.due_date
FROM public.submissions s
JOIN public.assignments a ON a.id = s.assignment_id
WHERE s.status = 'submitted'
  AND a.due_date IS NOT NULL
  AND s.submitted_at > a.due_date
ORDER BY s.submitted_at DESC
LIMIT 200;

-- 2) Mislabeled "late" (was actually on time)
SELECT
    'mislabeled_as_late'        AS issue,
    s.id                        AS submission_id,
    s.assignment_id,
    s.student_id,
    s.status,
    s.submitted_at,
    a.due_date
FROM public.submissions s
JOIN public.assignments a ON a.id = s.assignment_id
WHERE s.status = 'late'
  AND a.due_date IS NOT NULL
  AND s.submitted_at IS NOT NULL
  AND s.submitted_at <= a.due_date
ORDER BY s.submitted_at DESC
LIMIT 200;

-- 3) Drafts past their due_date (informational — these surface as derived
--    'overdue' or 'missed' to the client, but stay in the DB as 'draft').
SELECT
    'stale_draft_past_due'      AS issue,
    s.id                        AS submission_id,
    s.assignment_id,
    s.student_id,
    s.status,
    s.created_at                AS draft_created_at,
    a.due_date
FROM public.submissions s
JOIN public.assignments a ON a.id = s.assignment_id
WHERE s.status = 'draft'
  AND a.due_date IS NOT NULL
  AND a.due_date < NOW()
ORDER BY a.due_date DESC
LIMIT 200;
