import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode } from '../types/index.js'
import {
  BugReport,
  BugReportSeverity,
  BugReportStatus,
  CreateBugReportInput,
  ListBugReportsQuery,
  UpdateBugReportStatusInput,
} from '../types/bug-reports.js'
import {
  createBulkNotifications,
} from './notifications.js'
import {
  NotificationPriority,
  NotificationType,
} from '../types/notifications.js'
import logger from '../utils/logger.js'

type DatabaseErrorShape = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const toNormalizedDbErrorMessage = (error: DatabaseErrorShape | null | undefined): string => {
  const parts = [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')

  return parts.toLowerCase()
}

const isMissingRelationError = (error: DatabaseErrorShape | null | undefined): boolean => {
  const normalized = toNormalizedDbErrorMessage(error)

  return (
    error?.code === '42P01' ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}

const getNotificationPriorityFromSeverity = (
  severity: BugReportSeverity
): NotificationPriority => {
  switch (severity) {
    case BugReportSeverity.CRITICAL:
      return NotificationPriority.URGENT
    case BugReportSeverity.HIGH:
      return NotificationPriority.HIGH
    default:
      return NotificationPriority.NORMAL
  }
}

const notifyAdminsOfBugReport = async (report: BugReport): Promise<void> => {
  const { data: adminRows, error: adminsError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')

  if (adminsError) {
    logger.warn('Unable to load admin users for bug report notifications', {
      error: adminsError.message,
      bugReportId: report.id,
    })
    return
  }

  const adminIds = (adminRows || [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (adminIds.length === 0) {
    return
  }

  await createBulkNotifications({
    user_ids: adminIds,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: 'New Bug Report Submitted',
    message: `${report.reporter_name} reported: ${report.title}`,
    priority: getNotificationPriorityFromSeverity(report.severity),
    action_url: '/admin/bug-reports',
    metadata: {
      bug_report_id: report.id,
      severity: report.severity,
      status: report.status,
      reporter_email: report.reporter_email,
      page_url: report.page_url,
    },
  })
}

export const createBugReport = async (
  input: CreateBugReportInput
): Promise<BugReport> => {
  const normalizedSteps = input.steps_to_reproduce?.trim() || null
  const normalizedExpectedResult = input.expected_result?.trim() || null
  const normalizedActualResult = input.actual_result?.trim() || null
  const normalizedBrowserInfo = input.browser_info?.trim() || null

  const { data, error } = await supabaseAdmin
    .from('bug_reports')
    .insert({
      reporter_name: input.reporter_name,
      reporter_email: input.reporter_email,
      reporter_role: input.reporter_role || 'guest',
      title: input.title,
      description: input.description,
      steps_to_reproduce: normalizedSteps,
      expected_result: normalizedExpectedResult,
      actual_result: normalizedActualResult,
      page_url: input.page_url,
      browser_info: normalizedBrowserInfo,
      severity: input.severity || BugReportSeverity.MEDIUM,
      status: BugReportStatus.OPEN,
    })
    .select('*')
    .single()

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Bug report storage is unavailable. Run migration 018_bug_reports and retry.',
        503
      )
    }

    logger.error('Failed to create bug report', {
      error: error.message,
      code: error.code,
    })

    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to submit bug report',
      500
    )
  }

  const report = data as BugReport

  try {
    await notifyAdminsOfBugReport(report)
  } catch (notificationError) {
    logger.warn('Bug report created but admin notification dispatch failed', {
      bugReportId: report.id,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }

  return report
}

export const listBugReports = async (
  query: ListBugReportsQuery
): Promise<{ reports: BugReport[]; total: number }> => {
  let dbQuery = supabaseAdmin
    .from('bug_reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (query.status && query.status !== 'all') {
    dbQuery = dbQuery.eq('status', query.status)
  }

  if (query.severity && query.severity !== 'all') {
    dbQuery = dbQuery.eq('severity', query.severity)
  }

  dbQuery = dbQuery.range(query.offset, query.offset + query.limit - 1)

  const { data, error, count } = await dbQuery

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Bug report storage is unavailable. Run migration 018_bug_reports and retry.',
        503
      )
    }

    logger.error('Failed to list bug reports', {
      error: error.message,
      code: error.code,
    })

    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch bug reports',
      500
    )
  }

  return {
    reports: (data || []) as BugReport[],
    total: count || 0,
  }
}

export const updateBugReportStatus = async (
  bugReportId: string,
  input: UpdateBugReportStatusInput,
  adminId: string
): Promise<BugReport> => {
  const updatePayload: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  }

  if (input.admin_notes !== undefined) {
    const normalizedNotes = input.admin_notes.trim()
    updatePayload.admin_notes = normalizedNotes.length > 0 ? normalizedNotes : null
  }

  if (input.status === BugReportStatus.RESOLVED || input.status === BugReportStatus.CLOSED) {
    updatePayload.resolved_at = new Date().toISOString()
    updatePayload.resolved_by = adminId
  } else {
    updatePayload.resolved_at = null
    updatePayload.resolved_by = null
  }

  const { data, error } = await supabaseAdmin
    .from('bug_reports')
    .update(updatePayload)
    .eq('id', bugReportId)
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'Bug report not found',
        404
      )
    }

    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Bug report storage is unavailable. Run migration 018_bug_reports and retry.',
        503
      )
    }

    logger.error('Failed to update bug report status', {
      error: error.message,
      code: error.code,
      bugReportId,
      status: input.status,
      adminId,
    })

    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update bug report status',
      500
    )
  }

  return data as BugReport
}
