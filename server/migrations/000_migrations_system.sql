-- ============================================
-- Migration: 000_migrations_system
-- Description: Create migration tracking system
-- Dependencies: None (self-bootstrapping)
-- Author: MabiniLMS Team
-- Created: 2026-04-03
-- ============================================

-- UP
-- Apply migration: Create schema_migrations table

-- Migration tracking table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  applied_by VARCHAR(100),
  execution_time_ms INTEGER,
  CONSTRAINT valid_version CHECK (version ~ '^\d{3}$')
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
  ON public.schema_migrations(applied_at DESC);

-- Add comment to table
COMMENT ON TABLE public.schema_migrations IS 
  'Tracks applied database migrations for version control and rollback capability';

COMMENT ON COLUMN public.schema_migrations.version IS 
  'Migration version number (e.g., 001, 002, 003)';

COMMENT ON COLUMN public.schema_migrations.checksum IS 
  'SHA-256 checksum of migration file to detect modifications';

-- DOWN
-- Rollback migration: Drop schema_migrations table

DROP INDEX IF EXISTS idx_schema_migrations_applied_at;
DROP TABLE IF EXISTS public.schema_migrations CASCADE;
