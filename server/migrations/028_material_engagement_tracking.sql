-- ============================================
-- Migration: 028_material_engagement_tracking
-- Description: Extend material progress records with engagement telemetry fields
-- Dependencies: 025_material_progress_and_submission_window
-- Author: MabiniLMS Team
-- Created: 2026-04-21
-- ============================================

-- UP
-- Apply migration: Add detailed engagement tracking fields for course materials.

ALTER TABLE public.material_progress
    ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.material_progress
    ADD COLUMN IF NOT EXISTS current_scroll_position NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.material_progress
    ADD COLUMN IF NOT EXISTS pages_viewed JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.material_progress
    ADD COLUMN IF NOT EXISTS interaction_events JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.material_progress
    DROP CONSTRAINT IF EXISTS material_progress_scroll_position_range_check;

ALTER TABLE public.material_progress
    ADD CONSTRAINT material_progress_scroll_position_range_check
    CHECK (current_scroll_position >= 0 AND current_scroll_position <= 100);

CREATE INDEX IF NOT EXISTS idx_material_progress_material_download_count
    ON public.material_progress(material_id, download_count DESC);

CREATE INDEX IF NOT EXISTS idx_material_progress_material_scroll_position
    ON public.material_progress(material_id, current_scroll_position DESC);

CREATE INDEX IF NOT EXISTS idx_material_progress_interaction_events_gin
    ON public.material_progress USING gin (interaction_events);

COMMENT ON COLUMN public.material_progress.download_count IS
    'Number of times the student downloaded this material.';

COMMENT ON COLUMN public.material_progress.current_scroll_position IS
    'Latest tracked scroll/page position in percent (0-100).';

COMMENT ON COLUMN public.material_progress.pages_viewed IS
    'JSONB array of visited page numbers for paginated materials.';

COMMENT ON COLUMN public.material_progress.interaction_events IS
    'Chronological JSONB event stream (view_start, view_end, download, scroll).';

-- DOWN
-- Rollback migration: Remove engagement telemetry fields.

DROP INDEX IF EXISTS idx_material_progress_interaction_events_gin;
DROP INDEX IF EXISTS idx_material_progress_material_scroll_position;
DROP INDEX IF EXISTS idx_material_progress_material_download_count;

ALTER TABLE public.material_progress
    DROP CONSTRAINT IF EXISTS material_progress_scroll_position_range_check;

ALTER TABLE public.material_progress
    DROP COLUMN IF EXISTS interaction_events;

ALTER TABLE public.material_progress
    DROP COLUMN IF EXISTS pages_viewed;

ALTER TABLE public.material_progress
    DROP COLUMN IF EXISTS current_scroll_position;

ALTER TABLE public.material_progress
    DROP COLUMN IF EXISTS download_count;
