import { supabaseAdmin } from '../../src/lib/supabase.js'
import { UserRole } from '../../src/types/index.js'
import { AuditEventType } from '../../src/services/audit.js'
import * as auditService from '../../src/services/audit.js'
import * as assignmentService from '../../src/services/assignments.js'
import * as gradesService from '../../src/services/grades.js'
import {
  normalizeSubmissionStorageSnapshotForRead,
  summarizeSubmissionStorageConsistencyIssues,
} from '../../src/services/submission-storage.js'

describe('submission storage read-path normalization', () => {
  it('normalizes legacy rows with provider fallbacks', () => {
    const normalized = normalizeSubmissionStorageSnapshotForRead({
      drive_file_id: 'drive-file-123',
      drive_file_name: 'Essay.pdf',
      drive_view_link: 'https://drive.google.com/file/d/drive-file-123/view',
      submitted_at: '2026-04-21T12:00:00.000Z',
    })

    expect(normalized.storage_provider).toBe('google_drive')
    expect(normalized.provider_file_id).toBe('drive-file-123')
    expect(normalized.provider_file_name).toBe('Essay.pdf')
    expect(normalized.submission_snapshot_at).toBe('2026-04-21T12:00:00.000Z')
    expect(normalized.storage_metadata_complete).toBe(false)
    expect(normalized.storage_consistency_issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'missing_storage_provider',
        'missing_provider_file_id',
        'missing_submission_snapshot_at',
      ])
    )
  })

  it('marks complete rows as metadata complete', () => {
    const normalized = normalizeSubmissionStorageSnapshotForRead({
      storage_provider: 'google_drive',
      provider_file_id: 'provider-123',
      provider_revision_id: '9',
      provider_mime_type: 'application/pdf',
      provider_size_bytes: 2048,
      provider_checksum: 'abc123',
      submission_snapshot_at: '2026-04-21T12:00:00.000Z',
      drive_file_name: 'Essay.pdf',
      drive_view_link: 'https://drive.google.com/file/d/provider-123/view',
      submitted_at: '2026-04-21T12:00:00.000Z',
    })

    expect(normalized.storage_metadata_complete).toBe(true)
    expect(normalized.storage_consistency_issues).toHaveLength(0)
    expect(normalized.provider_file_id).toBe('provider-123')
    expect(normalized.submission_snapshot_at).toBe('2026-04-21T12:00:00.000Z')
  })

  it('summarizes consistency issues by code', () => {
    const summary = summarizeSubmissionStorageConsistencyIssues([
      {
        storage_consistency_issues: [
          {
            code: 'missing_provider_file_id',
            severity: 'warning',
            message: 'fallback applied',
            fallback_applied: true,
          },
        ],
      },
      {
        storage_consistency_issues: [
          {
            code: 'missing_provider_file_id',
            severity: 'error',
            message: 'missing both provider and drive ids',
            fallback_applied: false,
          },
          {
            code: 'missing_submission_snapshot_at',
            severity: 'warning',
            message: 'fallback applied',
            fallback_applied: true,
          },
        ],
      },
    ])

    expect(summary).toEqual({
      missing_provider_file_id: 2,
      missing_submission_snapshot_at: 1,
    })
  })
})

describe('assignment submission diagnostics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns diagnostics report and records audit visibility event', async () => {
    const assignmentId = '11111111-1111-1111-1111-111111111111'
    const teacherId = '22222222-2222-2222-2222-222222222222'

    const assignmentBuilder = {
      eq: vi.fn(),
      single: vi.fn(),
    }
    assignmentBuilder.eq.mockReturnValue(assignmentBuilder)
    assignmentBuilder.single.mockResolvedValue({
      data: {
        id: assignmentId,
        title: 'Storage Diagnostics Assignment',
        assignment_type: 'activity',
        max_points: 100,
        course: {
          id: '33333333-3333-3333-3333-333333333333',
          title: 'Diagnostics Course',
          teacher: {
            id: teacherId,
            email: 'teacher@mabinicolleges.edu.ph',
            first_name: 'Test',
            last_name: 'Teacher',
          },
        },
      },
      error: null,
    })

    const submissionBuilder = {
      eq: vi.fn(),
      order: vi.fn(),
    }
    submissionBuilder.eq.mockReturnValue(submissionBuilder)
    submissionBuilder.order.mockResolvedValue({
      data: [
        {
          id: 'sub-complete',
          assignment_id: assignmentId,
          student_id: '44444444-4444-4444-4444-444444444444',
          submitted_at: '2026-04-21T12:00:00.000Z',
          status: 'submitted',
          storage_provider: 'google_drive',
          provider_file_id: 'provider-file-1',
          submission_snapshot_at: '2026-04-21T12:00:00.000Z',
          drive_file_id: 'provider-file-1',
          drive_file_name: 'submission-1.pdf',
          drive_view_link: 'https://drive.google.com/file/d/provider-file-1/view',
        },
        {
          id: 'sub-legacy',
          assignment_id: assignmentId,
          student_id: '55555555-5555-5555-5555-555555555555',
          submitted_at: '2026-04-21T12:10:00.000Z',
          status: 'late',
          storage_provider: null,
          provider_file_id: null,
          submission_snapshot_at: null,
          drive_file_id: 'legacy-file-2',
          drive_file_name: 'submission-2.pdf',
          drive_view_link: 'https://drive.google.com/file/d/legacy-file-2/view',
        },
      ],
      error: null,
    })

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'assignments') {
        return {
          select: vi.fn().mockReturnValue(assignmentBuilder),
        } as any
      }

      if (table === 'submissions') {
        return {
          select: vi.fn().mockReturnValue(submissionBuilder),
        } as any
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const auditSpy = vi.spyOn(auditService, 'logAssignmentEvent').mockResolvedValue()

    const report = await assignmentService.getAssignmentSubmissionStorageDiagnostics(
      assignmentId,
      teacherId,
      UserRole.TEACHER
    )

    expect(report.assignment_id).toBe(assignmentId)
    expect(report.total_submissions).toBe(2)
    expect(report.consistent_submissions).toBe(1)
    expect(report.inconsistent_submissions).toBe(1)
    expect(report.issue_breakdown.missing_storage_provider).toBe(1)
    expect(report.issue_breakdown.missing_provider_file_id).toBe(1)
    expect(report.issue_breakdown.missing_submission_snapshot_at).toBe(1)
    expect(report.submissions[1].provider_file_id).toBe('legacy-file-2')

    expect(auditSpy).toHaveBeenCalledWith(
      teacherId,
      AuditEventType.ASSIGNMENT_SUBMISSION_STORAGE_DIAGNOSTICS_VIEWED,
      assignmentId,
      expect.objectContaining({
        total_submissions: 2,
        inconsistent_submissions: 1,
      })
    )
  })
})

describe('grade list submission provider contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('includes normalized provider metadata in grade submission payloads', async () => {
    const assignmentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const teacherId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

    const assignmentBuilder = {
      eq: vi.fn(),
      single: vi.fn(),
    }
    assignmentBuilder.eq.mockReturnValue(assignmentBuilder)
    assignmentBuilder.single.mockResolvedValue({
      data: {
        id: assignmentId,
        course: {
          teacher_id: teacherId,
        },
      },
      error: null,
    })

    const gradesBuilder = {
      eq: vi.fn(),
      order: vi.fn(),
    }
    gradesBuilder.eq.mockReturnValue(gradesBuilder)
    gradesBuilder.order.mockResolvedValue({
      data: [
        {
          id: 'grade-1',
          submission_id: 'submission-1',
          points_earned: 95,
          feedback: 'Great work',
          graded_by: teacherId,
          graded_at: '2026-04-21T12:00:00.000Z',
          grader: {
            id: teacherId,
            email: 'teacher@mabinicolleges.edu.ph',
            first_name: 'Test',
            last_name: 'Teacher',
          },
          submission: {
            id: 'submission-1',
            assignment_id: assignmentId,
            student_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            drive_file_id: 'legacy-file-1',
            drive_file_name: 'answer.pdf',
            drive_view_link: 'https://drive.google.com/file/d/legacy-file-1/view',
            storage_provider: null,
            provider_file_id: null,
            provider_revision_id: null,
            provider_mime_type: null,
            provider_size_bytes: null,
            provider_checksum: null,
            submission_snapshot_at: null,
            submitted_at: '2026-04-21T11:00:00.000Z',
            status: 'submitted',
            student: {
              id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
              email: 'student@mabinicolleges.edu.ph',
              first_name: 'Student',
              last_name: 'One',
            },
          },
        },
      ],
      error: null,
    })

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'assignments') {
        return {
          select: vi.fn().mockReturnValue(assignmentBuilder),
        } as any
      }

      if (table === 'grades') {
        return {
          select: vi.fn().mockReturnValue(gradesBuilder),
        } as any
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await gradesService.listAssignmentGrades(
      assignmentId,
      teacherId,
      UserRole.TEACHER
    )

    expect(result).toHaveLength(1)
    expect(result[0].submission.storage_provider).toBe('google_drive')
    expect(result[0].submission.provider_file_id).toBe('legacy-file-1')
    expect(result[0].submission.submission_snapshot_at).toBe('2026-04-21T11:00:00.000Z')
    expect(result[0].submission.storage_consistency_issues?.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'missing_storage_provider',
        'missing_provider_file_id',
        'missing_submission_snapshot_at',
      ])
    )
  })
})
