-- ============================================
-- Migration: 018_bug_reports
-- Description: Create bug reports storage for public submissions and admin review
-- Dependencies: 001_initial_schema, 004_admin_system
-- Author: MabiniLMS Team
-- Created: 2026-04-16
-- ============================================

-- UP
-- Apply migration: Create bug_reports table and admin access policies

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_name VARCHAR(120) NOT NULL,
  reporter_email VARCHAR(255) NOT NULL,
  reporter_role VARCHAR(20),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  expected_result TEXT,
  actual_result TEXT,
  page_url TEXT,
  browser_info TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bug_reports_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT bug_reports_status_check CHECK (status IN ('open', 'in_review', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status
  ON public.bug_reports(status);

CREATE INDEX IF NOT EXISTS idx_bug_reports_severity
  ON public.bug_reports(severity);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at
  ON public.bug_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter_email
  ON public.bug_reports(reporter_email);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bug_reports_select_policy ON public.bug_reports;
CREATE POLICY bug_reports_select_policy ON public.bug_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS bug_reports_update_policy ON public.bug_reports;
CREATE POLICY bug_reports_update_policy ON public.bug_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

GRANT SELECT, UPDATE ON public.bug_reports TO authenticated;

COMMENT ON TABLE public.bug_reports IS 'Bug reports submitted by users for admin triage and resolution';
COMMENT ON COLUMN public.bug_reports.status IS 'Workflow status: open, in_review, resolved, closed';
COMMENT ON COLUMN public.bug_reports.severity IS 'Severity level: low, medium, high, critical';

-- DOWN
-- Rollback migration: Drop bug_reports table and policies

REVOKE SELECT, UPDATE ON public.bug_reports FROM authenticated;

DROP POLICY IF EXISTS bug_reports_update_policy ON public.bug_reports;
DROP POLICY IF EXISTS bug_reports_select_policy ON public.bug_reports;

DROP INDEX IF EXISTS idx_bug_reports_reporter_email;
DROP INDEX IF EXISTS idx_bug_reports_created_at;
DROP INDEX IF EXISTS idx_bug_reports_severity;
DROP INDEX IF EXISTS idx_bug_reports_status;

DROP TABLE IF EXISTS public.bug_reports CASCADE;
