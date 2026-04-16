import { z } from 'zod'

export enum BugReportSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum BugReportStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

const bugReportStatusFilterSchema = z.enum([
  'all',
  BugReportStatus.OPEN,
  BugReportStatus.IN_REVIEW,
  BugReportStatus.RESOLVED,
  BugReportStatus.CLOSED,
])

const bugReportSeverityFilterSchema = z.enum([
  'all',
  BugReportSeverity.LOW,
  BugReportSeverity.MEDIUM,
  BugReportSeverity.HIGH,
  BugReportSeverity.CRITICAL,
])

export const bugReportSchema = z.object({
  id: z.string().uuid(),
  reporter_user_id: z.string().uuid().nullable().optional(),
  reporter_name: z.string(),
  reporter_email: z.string().email(),
  reporter_role: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  steps_to_reproduce: z.string().nullable().optional(),
  expected_result: z.string().nullable().optional(),
  actual_result: z.string().nullable().optional(),
  page_url: z.string().nullable().optional(),
  browser_info: z.string().nullable().optional(),
  severity: z.nativeEnum(BugReportSeverity),
  status: z.nativeEnum(BugReportStatus),
  admin_notes: z.string().nullable().optional(),
  resolved_at: z.string().datetime().nullable().optional(),
  resolved_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type BugReport = z.infer<typeof bugReportSchema>

export const createBugReportSchema = z.object({
  reporter_name: z.string().trim().min(2, 'Reporter name is required').max(120),
  reporter_email: z.string().trim().email('Valid email is required').max(255),
  reporter_role: z.enum(['student', 'teacher', 'admin', 'parent', 'guest', 'other']).optional().default('guest'),
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(180),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  steps_to_reproduce: z.string().trim().max(5000).optional(),
  expected_result: z.string().trim().max(3000).optional(),
  actual_result: z.string().trim().max(3000).optional(),
  page_url: z.string().trim().url('Valid page URL is required').max(2048),
  browser_info: z.string().trim().max(512).optional(),
  severity: z.nativeEnum(BugReportSeverity).optional().default(BugReportSeverity.MEDIUM),
})

export type CreateBugReportInput = z.infer<typeof createBugReportSchema>

export const listBugReportsQuerySchema = z.object({
  status: bugReportStatusFilterSchema.optional().default('all'),
  severity: bugReportSeverityFilterSchema.optional().default('all'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export type ListBugReportsQuery = z.infer<typeof listBugReportsQuerySchema>

export const bugReportIdParamSchema = z.object({
  id: z.string().uuid('Invalid bug report ID'),
})

export const updateBugReportStatusSchema = z.object({
  status: z.nativeEnum(BugReportStatus),
  admin_notes: z.string().trim().max(3000).optional(),
})

export type UpdateBugReportStatusInput = z.infer<typeof updateBugReportStatusSchema>
