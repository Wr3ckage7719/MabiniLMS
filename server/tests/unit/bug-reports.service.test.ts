import { supabaseAdmin } from '../../src/lib/supabase.js'
import * as bugReportsService from '../../src/services/bug-reports.js'
import * as notificationService from '../../src/services/notifications.js'
import { BugReportSeverity, BugReportStatus } from '../../src/types/bug-reports.js'
import { NotificationType } from '../../src/types/notifications.js'

describe('bugReportsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a bug report and notifies admins', async () => {
    const createdReport = {
      id: '11111111-1111-1111-1111-111111111111',
      reporter_user_id: null,
      reporter_name: 'Niccolo Balon',
      reporter_email: 'balonniccolo@gmail.com',
      reporter_role: 'student',
      title: 'PWA install prompt missing',
      description: 'Install button is disabled on mobile',
      steps_to_reproduce: 'Open landing page on mobile',
      expected_result: 'Install prompt appears',
      actual_result: 'No prompt appears',
      page_url: 'https://mabinilms.vercel.app/',
      browser_info: 'Mozilla/5.0',
      severity: BugReportSeverity.HIGH,
      status: BugReportStatus.OPEN,
      admin_notes: null,
      resolved_at: null,
      resolved_by: null,
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    }

    const bugReportInsertSingle = vi.fn().mockResolvedValue({ data: createdReport, error: null })
    const bugReportInsertSelect = vi.fn().mockReturnValue({ single: bugReportInsertSingle })
    const bugReportInsert = vi.fn().mockReturnValue({ select: bugReportInsertSelect })

    const profilesEq = vi.fn().mockResolvedValue({ data: [{ id: 'admin-1' }], error: null })
    const profilesSelect = vi.fn().mockReturnValue({ eq: profilesEq })

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'bug_reports') {
        return {
          insert: bugReportInsert,
        } as any
      }

      if (table === 'profiles') {
        return {
          select: profilesSelect,
        } as any
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const notificationsSpy = vi
      .spyOn(notificationService, 'createBulkNotifications')
      .mockResolvedValue({ created: 1, failed: 0 })

    const result = await bugReportsService.createBugReport({
      reporter_name: 'Niccolo Balon',
      reporter_email: 'balonniccolo@gmail.com',
      reporter_role: 'student',
      title: 'PWA install prompt missing',
      description: 'Install button is disabled on mobile',
      steps_to_reproduce: 'Open landing page on mobile',
      expected_result: 'Install prompt appears',
      actual_result: 'No prompt appears',
      page_url: 'https://mabinilms.vercel.app/',
      browser_info: 'Mozilla/5.0',
      severity: BugReportSeverity.HIGH,
    })

    expect(result.id).toBe(createdReport.id)
    expect(notificationsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_ids: ['admin-1'],
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
      })
    )
  })

  it('applies status filter when listing bug reports', async () => {
    const createdReport = {
      id: '22222222-2222-2222-2222-222222222222',
      reporter_name: 'Jane Doe',
      reporter_email: 'jane@example.com',
      reporter_role: 'teacher',
      title: 'Dashboard does not refresh',
      description: 'Student count does not update',
      steps_to_reproduce: null,
      expected_result: null,
      actual_result: null,
      page_url: null,
      browser_info: null,
      severity: BugReportSeverity.MEDIUM,
      status: BugReportStatus.OPEN,
      admin_notes: null,
      resolved_at: null,
      resolved_by: null,
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    }

    const queryBuilder = {
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    }

    queryBuilder.eq.mockReturnValue(queryBuilder)
    queryBuilder.order.mockReturnValue(queryBuilder)
    queryBuilder.range.mockResolvedValue({ data: [createdReport], error: null, count: 1 })

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'bug_reports') {
        return {
          select: vi.fn().mockReturnValue(queryBuilder),
        } as any
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const result = await bugReportsService.listBugReports({
      status: 'open',
      severity: 'all',
      limit: 20,
      offset: 0,
    })

    expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'open')
    expect(result.total).toBe(1)
    expect(result.reports[0].id).toBe(createdReport.id)
  })

  it('marks report as resolved with resolver metadata', async () => {
    const adminId = '33333333-3333-3333-3333-333333333333'
    const reportId = '44444444-4444-4444-4444-444444444444'

    const updatedReport = {
      id: reportId,
      reporter_name: 'John Doe',
      reporter_email: 'john@example.com',
      reporter_role: 'student',
      title: 'Join class fails',
      description: 'Enrollment throws error',
      steps_to_reproduce: null,
      expected_result: null,
      actual_result: null,
      page_url: null,
      browser_info: null,
      severity: BugReportSeverity.CRITICAL,
      status: BugReportStatus.RESOLVED,
      admin_notes: 'Hotfix deployed',
      resolved_at: '2026-04-16T00:10:00.000Z',
      resolved_by: adminId,
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:10:00.000Z',
    }

    const single = vi.fn().mockResolvedValue({ data: updatedReport, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'bug_reports') {
        return {
          update,
        } as any
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const result = await bugReportsService.updateBugReportStatus(
      reportId,
      {
        status: BugReportStatus.RESOLVED,
        admin_notes: 'Hotfix deployed',
      },
      adminId
    )

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: BugReportStatus.RESOLVED,
        resolved_by: adminId,
      })
    )
    expect(result.status).toBe(BugReportStatus.RESOLVED)
  })
})
