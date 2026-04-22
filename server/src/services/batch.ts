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
  calculateWeightedFinalGrade,
  normalizeAssignmentCategory,
  roundToTwoDecimals,
  GradeCategory,
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
  prelim: string
  midterm: string
  finals: string
  final_grade: string
  remarks: string
}

/**
 * Export grades in Mabini Colleges registrar format.
 * Maps: activity→Prelim (30%), quiz→Midterm (30%), exam→Finals (40%)
 */
export const exportRegistrarGrades = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<string> => {
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, title, teacher_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  if (userRole !== UserRole.ADMIN && (course as any).teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized', 403)
  }

  const { data: enrollments, error: enrollError } = await supabaseAdmin
    .from('enrollments')
    .select(`
      student_id,
      profile:profiles!enrollments_student_id_fkey(
        id, first_name, last_name, email
      )
    `)
    .eq('course_id', courseId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)

  if (enrollError) {
    logger.error('Failed to fetch enrollments for registrar export', { error: enrollError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to export grades', 500)
  }

  const hasTypeColumn = await supportsAssignmentTypeColumn()
  const typeField = hasTypeColumn ? ', assignment_type' : ''

  const { data: allGrades, error: gradesError } = await supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        student_id,
        assignment:assignments!inner(
          id, max_points, course_id${typeField}
        )
      )
    `)
    .eq('submission.assignment.course_id', courseId)

  if (gradesError) {
    logger.error('Failed to fetch grades for registrar export', { error: gradesError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to export grades', 500)
  }

  type CategoryAgg = { points_earned: number; points_possible: number }
  const studentAggregates = new Map<string, Record<GradeCategory, CategoryAgg>>()

  for (const row of allGrades || []) {
    const submission = Array.isArray((row as any).submission)
      ? (row as any).submission[0]
      : (row as any).submission
    const assignment = Array.isArray(submission?.assignment)
      ? submission.assignment[0]
      : submission?.assignment

    if (!assignment || !submission?.student_id) continue

    const studentId = submission.student_id as string
    if (!studentAggregates.has(studentId)) {
      studentAggregates.set(studentId, {
        exam: { points_earned: 0, points_possible: 0 },
        quiz: { points_earned: 0, points_possible: 0 },
        activity: { points_earned: 0, points_possible: 0 },
      })
    }

    const agg = studentAggregates.get(studentId)!
    const category = normalizeAssignmentCategory(normalizeAssignmentType((assignment as any).assignment_type))
    agg[category].points_earned += Number((row as any).points_earned || 0)
    agg[category].points_possible += Number(assignment.max_points || 0)
  }

  const GRADE_CATEGORIES: GradeCategory[] = ['exam', 'quiz', 'activity']

  const rows: RegistrarExportRow[] = []

  for (const enrollment of enrollments || []) {
    const profile = Array.isArray((enrollment as any).profile)
      ? (enrollment as any).profile[0]
      : (enrollment as any).profile

    const studentId = enrollment.student_id as string
    const agg = studentAggregates.get(studentId) || {
      exam: { points_earned: 0, points_possible: 0 },
      quiz: { points_earned: 0, points_possible: 0 },
      activity: { points_earned: 0, points_possible: 0 },
    }

    const categoryPercentages: Partial<Record<GradeCategory, number | null>> = {}
    for (const cat of GRADE_CATEGORIES) {
      categoryPercentages[cat] = agg[cat].points_possible > 0
        ? calculatePercentage(agg[cat].points_earned, agg[cat].points_possible)
        : null
    }

    const finalPct = calculateWeightedFinalGrade(categoryPercentages)
    const activityPct = categoryPercentages.activity ?? null
    const quizPct = categoryPercentages.quiz ?? null
    const examPct = categoryPercentages.exam ?? null

    const lastName = profile?.last_name || ''
    const firstName = profile?.first_name || ''
    const middleName = ''

    rows.push({
      lrn: '',
      last_name: lastName,
      first_name: firstName,
      middle_initial: middleName,
      prelim: activityPct !== null ? roundToTwoDecimals(activityPct).toFixed(2) : 'N/A',
      midterm: quizPct !== null ? roundToTwoDecimals(quizPct).toFixed(2) : 'N/A',
      finals: examPct !== null ? roundToTwoDecimals(examPct).toFixed(2) : 'N/A',
      final_grade: finalPct !== null ? roundToTwoDecimals(finalPct).toFixed(2) : 'INC',
      remarks: finalPct !== null ? (finalPct >= 75 ? 'Passed' : 'Failed') : 'INC',
    })
  }

  rows.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))

  const header = 'LRN,Last Name,First Name,Middle Initial,Prelim (Activity 30%),Midterm (Quiz 30%),Finals (Exam 40%),Final Grade,Remarks'
  const csvRows = rows.map((r) =>
    [
      r.lrn,
      `"${r.last_name.replace(/"/g, '""')}"`,
      `"${r.first_name.replace(/"/g, '""')}"`,
      `"${r.middle_initial.replace(/"/g, '""')}"`,
      r.prelim,
      r.midterm,
      r.finals,
      r.final_grade,
      r.remarks,
    ].join(',')
  )

  return [header, ...csvRows].join('\n')
}
