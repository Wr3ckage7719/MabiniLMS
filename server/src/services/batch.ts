/**
 * Batch Operations Service
 * 
 * Handles bulk operations like enrollment, grade export, and data imports.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode, UserRole } from '../types/index.js'
import {
  calculatePercentage,
  calculateLetterGrade,
  normalizeAssignmentCategory,
  roundToTwoDecimals,
  MabiniGradingPeriod,
  calculateMabiniPeriodGrade,
  calculateMabiniRating,
  convertToMabiniGradePoint,
  MABINI_PERIOD_WEIGHTS,
} from '../types/grades.js'
import { normalizeAssignmentType, supportsAssignmentTypeColumn } from '../utils/assignmentType.js'
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js'
import { sendEnrollmentNotification } from './notifications.js'
import { isActiveEnrollmentStatus } from '../utils/enrollmentStatus.js'
import logger from '../utils/logger.js'

// ============================================
// Types
// ============================================

export interface BulkEnrollmentInput {
  course_id: string
  student_ids: string[]
  send_notifications?: boolean
}

export interface BulkEnrollmentResult {
  success: number
  failed: number
  errors: Array<{ student_id: string; error: string }>
}

export interface BulkUnenrollmentInput {
  course_id: string
  student_ids: string[]
}

export interface GradeExportFormat {
  format: 'csv' | 'json'
  include_feedback?: boolean
  include_student_info?: boolean
}

export interface GradeExportRow {
  student_id: string
  student_name?: string
  student_email?: string
  assignment_title: string
  points_earned: number
  max_points: number
  percentage: number
  letter_grade: string
  feedback?: string | null
  submitted_at: string
  graded_at: string
}

export interface ImportUserInput {
  email: string
  first_name: string
  last_name: string
  role?: UserRole
}

export interface BulkUserImportResult {
  created: number
  updated: number
  failed: number
  errors: Array<{ email: string; error: string }>
}

// ============================================
// Bulk Enrollment
// ============================================

/**
 * Bulk enroll students in a course
 */
export const bulkEnroll = async (
  input: BulkEnrollmentInput,
  userId: string,
  userRole: UserRole
): Promise<BulkEnrollmentResult> => {
  // Verify course exists and user has permission
  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('id, title, teacher_id')
    .eq('id', input.course_id)
    .single()

  if (!course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized to enroll students in this course', 403)
  }

  let enrollmentActor:
    | {
        id: string
        name?: string
        avatar_url?: string | null
      }
    | undefined

  if (course.teacher_id) {
    const { data: teacherProfile, error: teacherProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, avatar_url')
      .eq('id', course.teacher_id)
      .maybeSingle()

    if (teacherProfileError) {
      logger.warn('Failed to resolve bulk enrollment notification actor profile', {
        course_id: input.course_id,
        teacher_id: course.teacher_id,
        error: teacherProfileError.message,
      })
    } else if (teacherProfile?.id) {
      const firstName = (teacherProfile.first_name || '').trim()
      const lastName = (teacherProfile.last_name || '').trim()
      const displayName = `${firstName} ${lastName}`.trim() || teacherProfile.email || 'Instructor'

      enrollmentActor = {
        id: teacherProfile.id,
        name: displayName,
        avatar_url: teacherProfile.avatar_url || null,
      }
    }
  }

  const result: BulkEnrollmentResult = {
    success: 0,
    failed: 0,
    errors: [],
  }

  // Process each student
  for (const studentId of input.student_ids) {
    try {
      // Check if student exists
      const { data: student } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', studentId)
        .single()

      if (!student) {
        result.failed++
        result.errors.push({ student_id: studentId, error: 'Student not found' })
        continue
      }

      if (student.role !== UserRole.STUDENT) {
        result.failed++
        result.errors.push({ student_id: studentId, error: 'User is not a student' })
        continue
      }

      const { data: existingEnrollments, error: existingEnrollmentError } = await supabaseAdmin
        .from('enrollments')
        .select('id, status')
        .eq('course_id', input.course_id)
        .eq('student_id', studentId)
        .order('enrolled_at', { ascending: false })

      if (existingEnrollmentError) {
        result.failed++
        result.errors.push({
          student_id: studentId,
          error: `Failed to verify enrollment state: ${existingEnrollmentError.message}`,
        })
        continue
      }

      const enrollmentRows = existingEnrollments || []
      const alreadyEnrolled = enrollmentRows.some((enrollment) =>
        isActiveEnrollmentStatus(enrollment.status)
      )

      if (alreadyEnrolled) {
        result.failed++
        result.errors.push({ student_id: studentId, error: 'Already enrolled' })
        continue
      }

      let enrollError: { message: string } | null = null

      if (enrollmentRows.length > 0) {
        // Reactivate existing historical enrollment rows instead of inserting a new row.
        const { error: reactivateError } = await supabaseAdmin
          .from('enrollments')
          .update({
            status: 'active',
            enrolled_at: new Date().toISOString(),
          })
          .eq('course_id', input.course_id)
          .eq('student_id', studentId)

        enrollError = reactivateError
      } else {
        const { error: insertError } = await supabaseAdmin
          .from('enrollments')
          .insert({
            course_id: input.course_id,
            student_id: studentId,
            status: 'active',
          })

        enrollError = insertError
      }

      if (enrollError) {
        result.failed++
        result.errors.push({ student_id: studentId, error: enrollError.message })
        continue
      }

      result.success++

      // Send notification if enabled
      if (input.send_notifications) {
        try {
          await sendEnrollmentNotification(studentId, course.title, course.id, enrollmentActor)
        } catch {
          // Don't fail the enrollment if notification fails
          logger.warn('Failed to send enrollment notification', { studentId })
        }
      }
    } catch (error: any) {
      result.failed++
      result.errors.push({ student_id: studentId, error: error.message || 'Unknown error' })
    }
  }

  logger.info('Bulk enrollment completed', {
    course_id: input.course_id,
    success: result.success,
    failed: result.failed,
  })

  return result
}

/**
 * Bulk unenroll students from a course
 */
export const bulkUnenroll = async (
  input: BulkUnenrollmentInput,
  userId: string,
  userRole: UserRole
): Promise<BulkEnrollmentResult> => {
  // Verify course exists and user has permission
  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', input.course_id)
    .single()

  if (!course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized', 403)
  }

  const result: BulkEnrollmentResult = {
    success: 0,
    failed: 0,
    errors: [],
  }

  for (const studentId of input.student_ids) {
    try {
      const { error, count } = await supabaseAdmin
        .from('enrollments')
        .delete()
        .eq('course_id', input.course_id)
        .eq('student_id', studentId)

      if (error) {
        result.failed++
        result.errors.push({ student_id: studentId, error: error.message })
      } else if (count === 0) {
        result.failed++
        result.errors.push({ student_id: studentId, error: 'Not enrolled' })
      } else {
        result.success++
      }
    } catch (error: any) {
      result.failed++
      result.errors.push({ student_id: studentId, error: error.message || 'Unknown error' })
    }
  }

  logger.info('Bulk unenrollment completed', {
    course_id: input.course_id,
    success: result.success,
    failed: result.failed,
  })

  return result
}

// ============================================
// Grade Export
// ============================================

/**
 * Export grades for a course or assignment
 */
export const exportGrades = async (
  courseId: string,
  assignmentId: string | null,
  options: GradeExportFormat,
  userId: string,
  userRole: UserRole
): Promise<GradeExportRow[] | string> => {
  // Verify course access
  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single()

  if (!course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized', 403)
  }

  // Build query
  let query = supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      feedback,
      graded_at,
      submission:submissions!inner(
        student_id,
        created_at,
        assignment:assignments!inner(
          id,
          title,
          max_points,
          course_id
        ),
        student:profiles!inner(
          id,
          first_name,
          last_name,
          email
        )
      )
    `)
    .eq('submission.assignment.course_id', courseId)

  if (assignmentId) {
    query = query.eq('submission.assignment.id', assignmentId)
  }

  const { data: grades, error } = await query

  if (error) {
    logger.error('Failed to export grades', { error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to export grades', 500)
  }

  // Transform data
  const rows: GradeExportRow[] = (grades || []).map((grade: any) => {
    const submission = Array.isArray(grade.submission) ? grade.submission[0] : grade.submission
    const assignment = Array.isArray(submission?.assignment) ? submission.assignment[0] : submission?.assignment
    const student = Array.isArray(submission?.student) ? submission.student[0] : submission?.student

    const percentage = calculatePercentage(grade.points_earned, assignment?.max_points ?? 100)
    const letterGrade = calculateLetterGrade(percentage)

    const row: GradeExportRow = {
      student_id: submission?.student_id,
      assignment_title: assignment?.title,
      points_earned: grade.points_earned,
      max_points: assignment?.max_points,
      percentage,
      letter_grade: letterGrade,
      submitted_at: submission?.created_at,
      graded_at: grade.graded_at,
    }

    if (options.include_student_info) {
      row.student_name = `${student?.first_name} ${student?.last_name}`.trim()
      row.student_email = student?.email
    }

    if (options.include_feedback) {
      row.feedback = grade.feedback
    }

    return row
  })

  // Return in requested format
  if (options.format === 'csv') {
    return convertToCSV(rows, options)
  }

  return rows
}

/**
 * Convert grade rows to CSV format
 */
function convertToCSV(rows: GradeExportRow[], options: GradeExportFormat): string {
  if (rows.length === 0) return ''

  const headers: string[] = ['Student ID']
  
  if (options.include_student_info) {
    headers.push('Student Name', 'Student Email')
  }
  
  headers.push(
    'Assignment',
    'Points Earned',
    'Max Points',
    'Percentage',
    'Letter Grade',
    'Submitted At',
    'Graded At'
  )

  if (options.include_feedback) {
    headers.push('Feedback')
  }

  const csvRows: string[] = [headers.join(',')]

  for (const row of rows) {
    const values: (string | number)[] = [row.student_id]

    if (options.include_student_info) {
      values.push(
        `"${(row.student_name || '').replace(/"/g, '""')}"`,
        row.student_email || ''
      )
    }

    values.push(
      `"${row.assignment_title.replace(/"/g, '""')}"`,
      row.points_earned,
      row.max_points,
      row.percentage,
      row.letter_grade,
      row.submitted_at,
      row.graded_at
    )

    if (options.include_feedback) {
      values.push(`"${(row.feedback || '').replace(/"/g, '""')}"`)
    }

    csvRows.push(values.join(','))
  }

  return csvRows.join('\n')
}

// ============================================
// Student Import
// ============================================

/**
 * Bulk import students from data
 */
export const importStudents = async (
  students: ImportUserInput[],
  _userId: string,
  userRole: UserRole
): Promise<BulkUserImportResult> => {
  if (userRole !== UserRole.ADMIN) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Admin access required', 403)
  }

  const result: BulkUserImportResult = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  }

  for (const student of students) {
    try {
      // Check if user already exists
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', student.email)
        .single()

      if (existing) {
        // Update existing user
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            first_name: student.first_name,
            last_name: student.last_name,
          })
          .eq('id', existing.id)

        if (updateError) {
          result.failed++
          result.errors.push({ email: student.email, error: updateError.message })
        } else {
          result.updated++
        }
      } else {
        // Create new user via auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: student.email,
          email_confirm: true,
          user_metadata: {
            first_name: student.first_name,
            last_name: student.last_name,
            role: student.role || UserRole.STUDENT,
          },
        })

        if (authError) {
          result.failed++
          result.errors.push({ email: student.email, error: authError.message })
          continue
        }

        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.user.id,
            email: student.email,
            first_name: student.first_name,
            last_name: student.last_name,
            role: student.role || UserRole.STUDENT,
          })

        if (profileError) {
          result.failed++
          result.errors.push({ email: student.email, error: profileError.message })
        } else {
          result.created++
        }
      }
    } catch (error: any) {
      result.failed++
      result.errors.push({ email: student.email, error: error.message || 'Unknown error' })
    }
  }

  logger.info('Bulk student import completed', {
    created: result.created,
    updated: result.updated,
    failed: result.failed,
  })

  return result
}

// ============================================
// Course Copy
// ============================================

/**
 * Copy a course with all its materials and assignments
 */
export const copyCourse = async (
  sourceCourseId: string,
  newTitle: string,
  userId: string,
  userRole: UserRole
): Promise<{ course_id: string; materials_copied: number; assignments_copied: number }> => {
  // Verify access to source course
  const { data: source } = await supabaseAdmin
    .from('courses')
    .select('*')
    .eq('id', sourceCourseId)
    .single()

  if (!source) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Source course not found', 404)
  }

  if (userRole !== UserRole.ADMIN && source.teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized to copy this course', 403)
  }

  // Create new course
  const { data: newCourse, error: courseError } = await supabaseAdmin
    .from('courses')
    .insert({
      title: newTitle,
      description: source.description,
      teacher_id: userRole === UserRole.ADMIN ? source.teacher_id : userId,
      status: 'draft',
    })
    .select()
    .single()

  if (courseError) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create course copy', 500)
  }

  // Copy materials
  const { data: materials } = await supabaseAdmin
    .from('course_materials')
    .select('*')
    .eq('course_id', sourceCourseId)

  let materialsCopied = 0
  if (materials && materials.length > 0) {
    const newMaterials = materials.map((m) => ({
      course_id: newCourse.id,
      title: m.title,
      type: m.type,
      file_url: m.file_url,
      drive_file_id: m.drive_file_id,
      drive_view_link: m.drive_view_link,
      uploaded_at: m.uploaded_at,
    }))

    const { data: inserted } = await supabaseAdmin
      .from('course_materials')
      .insert(newMaterials)
      .select()

    materialsCopied = inserted?.length || 0
  }

  // Copy assignments (without submissions/grades)
  const { data: assignments } = await supabaseAdmin
    .from('assignments')
    .select('*')
    .eq('course_id', sourceCourseId)

  let assignmentsCopied = 0
  if (assignments && assignments.length > 0) {
    const newAssignments = assignments.map((a) => ({
      course_id: newCourse.id,
      title: a.title,
      instructions: a.instructions,
      due_date: null, // Reset due dates
      max_points: a.max_points,
      submission_type: a.submission_type,
      google_drive_folder_id: null, // Reset Google Drive links
    }))

    const { data: inserted } = await supabaseAdmin
      .from('assignments')
      .insert(newAssignments)
      .select()

    assignmentsCopied = inserted?.length || 0
  }

  logger.info('Course copied', {
    source_id: sourceCourseId,
    new_id: newCourse.id,
    materials: materialsCopied,
    assignments: assignmentsCopied,
  })

  return {
    course_id: newCourse.id,
    materials_copied: materialsCopied,
    assignments_copied: assignmentsCopied,
  }
}

// ============================================
// Registrar Export
// ============================================

export interface RegistrarExportRow {
  lrn: string
  last_name: string
  first_name: string
  middle_initial: string
  pre_mid_grade: string
  pre_mid_gp: string
  midterm_grade: string
  midterm_gp: string
  pre_final_grade: string
  pre_final_gp: string
  final_grade: string
  final_gp: string
  overall_grade: string
  overall_gp: string
  remarks: string
}

export interface RegistrarExportOptions {
  /**
   * When true, the CSV expands each period into raw/rating/weighted columns
   * per component, mirroring the per-period sheets in TTH 1-2_30PM.xlsx.
   */
  detailed?: boolean
}

type PeriodComponentAgg = {
  exam: { earned: number; possible: number }
  quiz: { earned: number; possible: number }
  recitation: { earned: number; possible: number }
  attendance: { earned: number; possible: number }
  project: { earned: number; possible: number }
  activity: { earned: number; possible: number }
}

const emptyPeriodAgg = (): PeriodComponentAgg => ({
  exam: { earned: 0, possible: 0 },
  quiz: { earned: 0, possible: 0 },
  recitation: { earned: 0, possible: 0 },
  attendance: { earned: 0, possible: 0 },
  project: { earned: 0, possible: 0 },
  activity: { earned: 0, possible: 0 },
})

const ALL_PERIODS: MabiniGradingPeriod[] = ['pre_mid', 'midterm', 'pre_final', 'final']

/**
 * Export grades in Mabini Colleges registrar format.
 * Uses 4-period model: Pre-Mid (25%), Midterm (25%), Pre-Final (25%), Final (25%).
 * Each period: Major Exam (45%), Quiz (15%), Recitation (15%), Attendance (20%), Project (5%).
 * Rating formula for exam/quiz: (raw/max) × 40 + 60.
 * Overall = average of 4 period weighted grades.
 * Grade points follow Philippine CHED scale (1.0–5.0).
 *
 * Teacher/admin: full class export.
 * Student: pass `scopeStudentId` = own id to restrict output to one row.
 */
export const exportRegistrarGrades = async (
  courseId: string,
  userId: string,
  userRole: UserRole,
  scopeStudentId?: string,
  options: RegistrarExportOptions = {}
): Promise<string> => {
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, title, teacher_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  const isStudentScope = Boolean(scopeStudentId)

  if (isStudentScope) {
    // Students may only export their OWN grade and must be enrolled in the course
    if (scopeStudentId !== userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Students can only export their own grade', 403)
    }
    const { data: enrollment, error: enrollCheckErr } = await supabaseAdmin
      .from('enrollments')
      .select('student_id, status')
      .eq('course_id', courseId)
      .eq('student_id', scopeStudentId)
      .maybeSingle()
    if (enrollCheckErr || !enrollment || !ACTIVE_ENROLLMENT_STATUSES.includes(enrollment.status as any)) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'You are not enrolled in this course', 403)
    }
  } else if (userRole !== UserRole.ADMIN && (course as any).teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized', 403)
  }

  const enrollmentsQuery = supabaseAdmin
    .from('enrollments')
    .select(`
      student_id,
      profile:profiles!enrollments_student_id_fkey(
        id, first_name, last_name, email
      )
    `)
    .eq('course_id', courseId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)

  if (scopeStudentId) {
    enrollmentsQuery.eq('student_id', scopeStudentId)
  }

  const { data: enrollments, error: enrollError } = await enrollmentsQuery

  if (enrollError) {
    logger.error('Failed to fetch enrollments for registrar export', { error: enrollError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to export grades', 500)
  }

  const hasTypeColumn = await supportsAssignmentTypeColumn()
  const typeField = hasTypeColumn ? ', assignment_type' : ''

  // Try to select grading_period; fall back gracefully if column doesn't exist yet
  let hasPeriodColumn = false
  let periodField = ''
  try {
    const { error: probeErr } = await supabaseAdmin
      .from('assignments')
      .select('id, grading_period')
      .limit(1)
    if (!probeErr) {
      hasPeriodColumn = true
      periodField = ', grading_period'
    }
  } catch {
    // column missing — all assignments treated as unpinned
  }

  const gradesQuery = supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        student_id,
        assignment:assignments!inner(
          id, max_points, course_id${typeField}${periodField}
        )
      )
    `)
    .eq('submission.assignment.course_id', courseId)

  if (scopeStudentId) {
    gradesQuery.eq('submission.student_id', scopeStudentId)
  }

  const { data: allGrades, error: gradesError } = await gradesQuery

  if (gradesError) {
    logger.error('Failed to fetch grades for registrar export', { error: gradesError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to export grades', 500)
  }

  // studentPeriodAgg[studentId][period][componentType]
  const studentPeriodAgg = new Map<string, Record<MabiniGradingPeriod, PeriodComponentAgg>>()
  let unpinnedAssignmentCount = 0

  for (const row of allGrades || []) {
    const submission = Array.isArray((row as any).submission)
      ? (row as any).submission[0]
      : (row as any).submission
    const assignment = Array.isArray(submission?.assignment)
      ? submission.assignment[0]
      : submission?.assignment

    if (!assignment || !submission?.student_id) continue

    const studentId = submission.student_id as string
    if (!studentPeriodAgg.has(studentId)) {
      studentPeriodAgg.set(studentId, {
        pre_mid: emptyPeriodAgg(),
        midterm: emptyPeriodAgg(),
        pre_final: emptyPeriodAgg(),
        final: emptyPeriodAgg(),
      })
    }

    const rawType = normalizeAssignmentType((assignment as any).assignment_type)
    const category = normalizeAssignmentCategory(rawType) as keyof PeriodComponentAgg
    const period = hasPeriodColumn
      ? ((assignment as any).grading_period as MabiniGradingPeriod | null)
      : null

    const earned = Number((row as any).points_earned || 0)
    const possible = Number(assignment.max_points || 0)

    if (period && ALL_PERIODS.includes(period)) {
      const agg = studentPeriodAgg.get(studentId)![period]
      agg[category].earned += earned
      agg[category].possible += possible
    } else {
      // Per Mabini Colleges format (TTH 1-2_30PM.xlsx), every graded item must belong to a
      // specific grading period. Unpinned assignments are excluded from the registrar
      // export rather than being counted in every period (which inflates each period grade).
      unpinnedAssignmentCount += 1
    }
  }

  if (unpinnedAssignmentCount > 0) {
    logger.warn('Registrar export: unpinned assignments excluded from period totals', {
      courseId,
      unpinnedAssignmentCount,
    })
  }

  type PeriodComponentBreakdown = {
    examRaw: number | null
    examMax: number | null
    examRating: number | null
    examWeighted: number | null
    quizRaw: number | null
    quizMax: number | null
    quizRating: number | null
    quizWeighted: number | null
    recitationRaw: number | null
    recitationMax: number | null
    recitationWeighted: number | null
    attendanceRaw: number | null
    attendanceMax: number | null
    attendanceWeighted: number | null
    projectRaw: number | null
    projectMax: number | null
    projectWeighted: number | null
  }

  type StudentRow = {
    base: RegistrarExportRow
    periodGrades: Record<MabiniGradingPeriod, number | null>
    periodBreakdowns: Record<MabiniGradingPeriod, PeriodComponentBreakdown>
  }

  const rows: StudentRow[] = []

  const emptyBreakdown = (): PeriodComponentBreakdown => ({
    examRaw: null, examMax: null, examRating: null, examWeighted: null,
    quizRaw: null, quizMax: null, quizRating: null, quizWeighted: null,
    recitationRaw: null, recitationMax: null, recitationWeighted: null,
    attendanceRaw: null, attendanceMax: null, attendanceWeighted: null,
    projectRaw: null, projectMax: null, projectWeighted: null,
  })

  const buildBreakdown = (agg: PeriodComponentAgg): PeriodComponentBreakdown => {
    const breakdown = emptyBreakdown()

    if (agg.exam.possible > 0) {
      breakdown.examRaw = roundToTwoDecimals(agg.exam.earned)
      breakdown.examMax = roundToTwoDecimals(agg.exam.possible)
      breakdown.examRating = calculateMabiniRating(agg.exam.earned, agg.exam.possible)
      breakdown.examWeighted = roundToTwoDecimals(breakdown.examRating * MABINI_PERIOD_WEIGHTS.exam)
    }
    if (agg.quiz.possible > 0) {
      breakdown.quizRaw = roundToTwoDecimals(agg.quiz.earned)
      breakdown.quizMax = roundToTwoDecimals(agg.quiz.possible)
      breakdown.quizRating = calculateMabiniRating(agg.quiz.earned, agg.quiz.possible)
      breakdown.quizWeighted = roundToTwoDecimals(breakdown.quizRating * MABINI_PERIOD_WEIGHTS.quiz)
    }
    // Recitation: explicit recitation entries OR (legacy) activity entries when no project conflict.
    const recitationSource = agg.recitation.possible > 0
      ? agg.recitation
      : (agg.activity.possible > 0 ? agg.activity : null)
    if (recitationSource) {
      breakdown.recitationRaw = roundToTwoDecimals(recitationSource.earned)
      breakdown.recitationMax = roundToTwoDecimals(recitationSource.possible)
      const pct = (recitationSource.earned / recitationSource.possible) * 100
      breakdown.recitationWeighted = roundToTwoDecimals(pct * MABINI_PERIOD_WEIGHTS.recitation)
    }
    if (agg.attendance.possible > 0) {
      breakdown.attendanceRaw = roundToTwoDecimals(agg.attendance.earned)
      breakdown.attendanceMax = roundToTwoDecimals(agg.attendance.possible)
      const pct = (agg.attendance.earned / agg.attendance.possible) * 100
      breakdown.attendanceWeighted = roundToTwoDecimals(pct * MABINI_PERIOD_WEIGHTS.attendance)
    }
    if (agg.project.possible > 0) {
      breakdown.projectRaw = roundToTwoDecimals(agg.project.earned)
      breakdown.projectMax = roundToTwoDecimals(agg.project.possible)
      const pct = (agg.project.earned / agg.project.possible) * 100
      breakdown.projectWeighted = roundToTwoDecimals(pct * MABINI_PERIOD_WEIGHTS.project)
    }
    return breakdown
  }

  for (const enrollment of enrollments || []) {
    const profile = Array.isArray((enrollment as any).profile)
      ? (enrollment as any).profile[0]
      : (enrollment as any).profile

    const studentId = enrollment.student_id as string
    const periodAgg = studentPeriodAgg.get(studentId)

    const periodGrades: Record<MabiniGradingPeriod, number | null> = {
      pre_mid: null, midterm: null, pre_final: null, final: null,
    }
    const periodBreakdowns: Record<MabiniGradingPeriod, PeriodComponentBreakdown> = {
      pre_mid: emptyBreakdown(),
      midterm: emptyBreakdown(),
      pre_final: emptyBreakdown(),
      final: emptyBreakdown(),
    }

    for (const period of ALL_PERIODS) {
      const agg = periodAgg?.[period]
      if (!agg) {
        periodGrades[period] = null
        continue
      }
      periodGrades[period] = calculateMabiniPeriodGrade({
        examPoints: agg.exam.possible > 0 ? agg.exam : null,
        quizPoints: agg.quiz.possible > 0 ? agg.quiz : null,
        recitationPoints: agg.recitation.possible > 0 ? agg.recitation : null,
        attendancePoints: agg.attendance.possible > 0 ? agg.attendance : null,
        projectPoints: agg.project.possible > 0 ? agg.project : null,
        activityPoints: agg.activity.possible > 0 ? agg.activity : null,
      })
      periodBreakdowns[period] = buildBreakdown(agg)
    }

    // Per the registrar reference workbook, the final overall grade is only valid
    // when ALL FOUR periods have grades. Partial overall is reported as INC so
    // students aren't shown an artificially-inflated standing.
    const allPeriodsComplete = ALL_PERIODS.every((p) => periodGrades[p] !== null)
    const overallGrade = allPeriodsComplete
      ? roundToTwoDecimals(
          ALL_PERIODS.reduce((sum, p) => sum + (periodGrades[p] as number), 0) / ALL_PERIODS.length
        )
      : null

    const fmt = (g: number | null) => g !== null ? roundToTwoDecimals(g).toFixed(2) : 'INC'
    const fmtGP = (g: number | null) => g !== null ? convertToMabiniGradePoint(g).toFixed(2) : 'INC'

    rows.push({
      base: {
        lrn: '',
        last_name: profile?.last_name || '',
        first_name: profile?.first_name || '',
        middle_initial: '',
        pre_mid_grade: fmt(periodGrades.pre_mid),
        pre_mid_gp: fmtGP(periodGrades.pre_mid),
        midterm_grade: fmt(periodGrades.midterm),
        midterm_gp: fmtGP(periodGrades.midterm),
        pre_final_grade: fmt(periodGrades.pre_final),
        pre_final_gp: fmtGP(periodGrades.pre_final),
        final_grade: fmt(periodGrades.final),
        final_gp: fmtGP(periodGrades.final),
        overall_grade: fmt(overallGrade),
        overall_gp: fmtGP(overallGrade),
        remarks: overallGrade !== null
          ? (convertToMabiniGradePoint(overallGrade) <= 3.00 ? 'Passed' : 'Failed')
          : 'INC',
      },
      periodGrades,
      periodBreakdowns,
    })
  }

  rows.sort(
    (a, b) =>
      a.base.last_name.localeCompare(b.base.last_name) ||
      a.base.first_name.localeCompare(b.base.first_name)
  )

  const fmtCell = (g: number | null) => g !== null ? roundToTwoDecimals(g).toFixed(2) : 'INC'

  if (options.detailed) {
    const periodHeaderBlock = (label: string) => [
      `${label} Exam Raw`, `${label} Exam Max`, `${label} Exam Rating`, `${label} Exam (45%)`,
      `${label} Quiz Raw`, `${label} Quiz Max`, `${label} Quiz Rating`, `${label} Quiz (15%)`,
      `${label} Recitation Raw`, `${label} Recitation Max`, `${label} Recitation (15%)`,
      `${label} Attendance Raw`, `${label} Attendance Max`, `${label} Attendance (20%)`,
      `${label} Project Raw`, `${label} Project Max`, `${label} Project (5%)`,
      `${label} Weighted Grade`, `${label} GP`,
    ]

    const detailedHeader = [
      'LRN', 'Last Name', 'First Name', 'Middle Initial',
      ...periodHeaderBlock('Pre-Mid'),
      ...periodHeaderBlock('Midterm'),
      ...periodHeaderBlock('Pre-Final'),
      ...periodHeaderBlock('Final'),
      'Overall Grade', 'Overall GP', 'Remarks',
    ].join(',')

    const periodCells = (b: PeriodComponentBreakdown, periodGrade: number | null) => [
      fmtCell(b.examRaw), fmtCell(b.examMax), fmtCell(b.examRating), fmtCell(b.examWeighted),
      fmtCell(b.quizRaw), fmtCell(b.quizMax), fmtCell(b.quizRating), fmtCell(b.quizWeighted),
      fmtCell(b.recitationRaw), fmtCell(b.recitationMax), fmtCell(b.recitationWeighted),
      fmtCell(b.attendanceRaw), fmtCell(b.attendanceMax), fmtCell(b.attendanceWeighted),
      fmtCell(b.projectRaw), fmtCell(b.projectMax), fmtCell(b.projectWeighted),
      fmtCell(periodGrade),
      periodGrade !== null ? convertToMabiniGradePoint(periodGrade).toFixed(2) : 'INC',
    ]

    const detailedRows = rows.map((r) =>
      [
        r.base.lrn,
        `"${r.base.last_name.replace(/"/g, '""')}"`,
        `"${r.base.first_name.replace(/"/g, '""')}"`,
        `"${r.base.middle_initial.replace(/"/g, '""')}"`,
        ...periodCells(r.periodBreakdowns.pre_mid, r.periodGrades.pre_mid),
        ...periodCells(r.periodBreakdowns.midterm, r.periodGrades.midterm),
        ...periodCells(r.periodBreakdowns.pre_final, r.periodGrades.pre_final),
        ...periodCells(r.periodBreakdowns.final, r.periodGrades.final),
        r.base.overall_grade,
        r.base.overall_gp,
        r.base.remarks,
      ].join(',')
    )

    return [detailedHeader, ...detailedRows].join('\n')
  }

  const header = [
    'LRN', 'Last Name', 'First Name', 'Middle Initial',
    'Pre-Mid Grade', 'Pre-Mid GP',
    'Midterm Grade', 'Midterm GP',
    'Pre-Final Grade', 'Pre-Final GP',
    'Final Grade', 'Final GP',
    'Overall Grade', 'Overall GP',
    'Remarks',
  ].join(',')

  const csvRows = rows.map(({ base: r }) =>
    [
      r.lrn,
      `"${r.last_name.replace(/"/g, '""')}"`,
      `"${r.first_name.replace(/"/g, '""')}"`,
      `"${r.middle_initial.replace(/"/g, '""')}"`,
      r.pre_mid_grade,
      r.pre_mid_gp,
      r.midterm_grade,
      r.midterm_gp,
      r.pre_final_grade,
      r.pre_final_gp,
      r.final_grade,
      r.final_gp,
      r.overall_grade,
      r.overall_gp,
      r.remarks,
    ].join(',')
  )

  return [header, ...csvRows].join('\n')
}
