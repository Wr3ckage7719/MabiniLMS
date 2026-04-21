-- ============================================
-- Migration: 029_course_material_metadata_columns
-- Description: Add file size and uploader metadata to course materials
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-22
-- ============================================

-- UP
-- Apply migration: Persist upload metadata for more accurate material details.

ALTER TABLE public.course_materials
    ADD COLUMN IF NOT EXISTS file_size BIGINT;

ALTER TABLE public.course_materials
    ADD COLUMN IF NOT EXISTS uploaded_by TEXT;

CREATE INDEX IF NOT EXISTS idx_course_materials_uploaded_by
    ON public.course_materials(uploaded_by);

COMMENT ON COLUMN public.course_materials.file_size IS
    'Original uploaded file size in bytes for this material.';

COMMENT ON COLUMN public.course_materials.uploaded_by IS
    'Uploader identifier captured at material creation time (typically email).';

-- DOWN
-- Rollback migration: Remove persisted upload metadata columns.

DROP INDEX IF EXISTS idx_course_materials_uploaded_by;

ALTER TABLE public.course_materials
    DROP COLUMN IF EXISTS uploaded_by;

ALTER TABLE public.course_materials
    DROP COLUMN IF EXISTS file_size;
