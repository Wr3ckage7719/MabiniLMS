-- ============================================
-- Migration: 038_lesson_general_backfill
-- Description: Parks every existing assignment and learning material into an
--              auto-generated "General" lesson per course (D10 from the
--              design plan). The General lesson is flagged is_general=true
--              so it never gates assessments — students continue to access
--              legacy work without an extra "Mark as done" step. Teachers
--              can later split the General lesson into structured lessons
--              from the editor UI.
-- Dependencies: 037_lesson_centric_flow
-- Author: MabiniLMS Team
-- Created: 2026-05-01
-- ============================================

-- UP

-- 1. Create one General lesson per course that doesn't already have one.
INSERT INTO public.lessons (
    course_id,
    title,
    description,
    topics,
    sort_order,
    is_published,
    is_general,
    completion_rule_type
)
SELECT
    c.id AS course_id,
    'General' AS title,
    'Holds existing assignments and materials that were created before lessons. Split or rename as needed.' AS description,
    '{}'::TEXT[] AS topics,
    -- Pin General to the very end of the lesson list so structured lessons
    -- created later show up first.
    9999 AS sort_order,
    true AS is_published,
    true AS is_general,
    'mark_as_done' AS completion_rule_type
FROM public.courses c
WHERE NOT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.course_id = c.id AND l.is_general = true
);

-- 2. Bind every existing assignment to its course's General lesson, unless
--    the assignment is already linked to some lesson (idempotent re-runs).
INSERT INTO public.lesson_assessments (lesson_id, assignment_id, is_optional, sort_order)
SELECT
    g.id AS lesson_id,
    a.id AS assignment_id,
    false AS is_optional,
    -- Keep ordering stable by created_at rank within the course.
    ROW_NUMBER() OVER (PARTITION BY a.course_id ORDER BY a.created_at) AS sort_order
FROM public.assignments a
JOIN public.lessons g
    ON g.course_id = a.course_id AND g.is_general = true
WHERE NOT EXISTS (
    SELECT 1 FROM public.lesson_assessments la
    WHERE la.assignment_id = a.id
);

-- 3. Bind every existing course_material to its course's General lesson.
INSERT INTO public.lesson_materials (lesson_id, material_id, sort_order)
SELECT
    g.id AS lesson_id,
    m.id AS material_id,
    ROW_NUMBER() OVER (PARTITION BY m.course_id ORDER BY m.created_at) AS sort_order
FROM public.course_materials m
JOIN public.lessons g
    ON g.course_id = m.course_id AND g.is_general = true
WHERE NOT EXISTS (
    SELECT 1 FROM public.lesson_materials lm
    WHERE lm.material_id = m.id AND lm.lesson_id = g.id
);

-- DOWN
-- Reversing the backfill drops everything that was auto-parked but leaves
-- intentionally-created lessons alone. We delete in dependency order.
-- DELETE FROM public.lesson_assessments la
--     USING public.lessons l
--     WHERE la.lesson_id = l.id AND l.is_general = true;
-- DELETE FROM public.lesson_materials lm
--     USING public.lessons l
--     WHERE lm.lesson_id = l.id AND l.is_general = true;
-- DELETE FROM public.lessons WHERE is_general = true;
