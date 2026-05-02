-- ============================================
-- Migration: 039_material_page_count
-- Description: Persist the number of pages/slides detected at upload time so
--              the in-app reader can show a stable page counter and gate
--              completion on reaching the final page.
-- Dependencies: 029_course_material_metadata_columns
-- Author: MabiniLMS Team
-- Created: 2026-05-02
-- ============================================

-- UP

ALTER TABLE public.course_materials
    ADD COLUMN IF NOT EXISTS page_count INTEGER;

COMMENT ON COLUMN public.course_materials.page_count IS
    'Number of viewable pages (PDF), pages (DOCX), or slides (PPTX) detected at upload. NULL when unknown or not applicable (images, video, links).';

-- DOWN

ALTER TABLE public.course_materials
    DROP COLUMN IF EXISTS page_count;
