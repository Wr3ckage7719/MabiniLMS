/**
 * Grading Service
 * 
 * Business logic for grading submissions.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode, UserRole } from '../types/index.js'
import {
  Grade,
  GradeWithGrader,
  GradeWithSubmission,
  GradeStatistics,
  CreateGradeInput,
  UpdateGradeInput,
  BulkGradeInput,
  COURSE_GRADE_WEIGHTS,
  GradeCategory,
  WeightedCourseGradeBreakdown,
  calculatePercentage,
  calculateLetterGrade,
  calculateWeightedContribution,
  calculateWeightedFinalGrade,
  normalizeAssignmentCategory,
  roundToTwoDecimals,
} from '../types/grades.js'
import { SubmissionStatus } from '../types/assignments.js'
import * as auditService from './audit.js'
import { AuditEventType } from './audit.js'
import { notifyGradeReleased, notifyStandingUpdated } from './websocket.js'
import logger from '../utils/logger.js'
import { normalizeAssignmentType, supportsAssignmentTypeColumn } from '../utils/assignmentType.js'
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js'

const isMissingRelationError = (error?: { code?: string; message?: string } | null): boolean => {
  const message = (error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  )
}

const GRADE_CATEGORIES: GradeCategory[] = ['exam', 'quiz', 'activity']

const recordSubmissionStatusHistory = async (
  submissionId: string,
  fromStatus: SubmissionStatus | null,
  toStatus: SubmissionStatus,
  changedBy: string,
  reason: string,
  metadata: Record<string, unknown>
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('submission_status_history')
    .insert({
      submission_id: submissionId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: changedBy,
      reason,
      metadata,
      created_at: new Date().toISOString(),
    })

  if (!error) {
    return
  }

  if (isMissingRelationError(error)) {
    logger.warn('submission_status_history table missing; grade status transition history not recorded', {
      submissionId,
      fromStatus,
      toStatus,
      changedBy,
    })
    return
  }

  logger.error('Failed to record grade-driven submission status history', {
    submissionId,
    fromStatus,
    toStatus,
    changedBy,
    error: error.message,
  })
  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to record submission status history', 500)
}

// ============================================
// Grade CRUD Operations
// ============================================

/**
 * Create a grade for a submission
 */
export const createGrade = async (
  input: CreateGradeInput,
  graderId: string,
  graderRole: UserRole
): Promise<Grade> => {
  // Get submission with assignment and course info
  const { data: submission, error: subError } = await supabaseAdmin
    .from('submissions')
    .select(`
      id, student_id, status,
      assignment:assignments(
        id, title, max_points, course_id,
        course:courses(id, title, teacher_id)
      )
    `)
    .eq('id', input.submission_id)
    .single()

  if (subError || !submission) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Submission not found', 404)
  }

  // Extract nested data
  const assignment = Array.isArray(submission.assignment)
    ? submission.assignment[0]
    : submission.assignment
  const course = assignment?.course
    ? (Array.isArray(assignment.course) ? assignment.course[0] : assignment.course)
    : null
  const currentSubmissionStatus = (submission.status as SubmissionStatus | null) ?? null

  if (currentSubmissionStatus === SubmissionStatus.DRAFT) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Draft submissions cannot be graded. Move submission to review before grading.',
      400
    )
  }

  // Authorization: Only course teacher or admin can grade
  if (graderRole !== UserRole.ADMIN && course?.teacher_id !== graderId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only grade submissions for your own courses',
      403
    )
  }

  // Validate points against max
  if (assignment && input.points_earned > assignment.max_points) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      `Points cannot exceed assignment maximum of ${assignment.max_points}`,
      400
    )
  }

  // Check if grade already exists
  const { data: existing } = await supabaseAdmin
    .from('grades')
    .select('id')
    .eq('submission_id', input.submission_id)
    .single()

  if (existing) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'Grade already exists for this submission. Use update instead.',
      409
    )
  }

  // Create grade
  const { data: grade, error: gradeError } = await supabaseAdmin
    .from('grades')
    .insert({
      submission_id: input.submission_id,
      points_earned: input.points_earned,
      feedback: input.feedback || null,
      graded_by: graderId,
      graded_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (gradeError) {
    logger.error('Failed to create grade', { error: gradeError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create grade', 500)
  }

  if (currentSubmissionStatus !== SubmissionStatus.GRADED) {
    const { error: statusError } = await supabaseAdmin
      .from('submissions')
      .update({ status: SubmissionStatus.GRADED })
      .eq('id', input.submission_id)

    if (statusError) {
      logger.error('Failed to update submission status after grade creation', {
        submissionId: input.submission_id,
        fromStatus: currentSubmissionStatus,
        toStatus: SubmissionStatus.GRADED,
        error: statusError.message,
      })
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update submission status', 500)
    }

    await recordSubmissionStatusHistory(
      input.submission_id,
      currentSubmissionStatus,
      SubmissionStatus.GRADED,
      graderId,
      'Submission graded',
      {
        source: 'grade_service',
        grade_id: grade.id,
        graded_by: graderId,
      }
    )
  }

  // Log grade assignment audit event
  await auditService.logGradeEvent(
    submission.student_id,
    AuditEventType.GRADE_ASSIGNED,
    grade.id,
    {
      submission_id: input.submission_id,
      assignment_id: assignment.id,
      points_earned: input.points_earned,
      max_points: assignment.max_points,
      graded_by: graderId,
    }
  );

  notifyGradeReleased(submission.student_id, {
    assignmentId: assignment.id,
    assignmentTitle: assignment.title || 'Assignment',
    courseName: course?.title || 'Course',
    score: input.points_earned,
    maxScore: assignment.max_points,
  });

  if (course?.id) {
    await notifyStandingUpdated(course.id, submission.student_id, {
      source: 'grade_created',
      assignmentId: assignment.id,
      submissionId: input.submission_id,
      gradeId: grade.id,
    })
  }

  logger.info('Grade created', {
    gradeId: grade.id,
    submissionId: input.submission_id,
    graderId,
  })

  return grade as Grade
}

/**
 * Update an existing grade
 */
export const updateGrade = async (
  gradeId: string,
  input: UpdateGradeInput,
  userId: string,
  userRole: UserRole
): Promise<Grade> => {
  // Get existing grade with submission/course info
  const { data: existingGrade, error: gradeError } = await supabaseAdmin
    .from('grades')
    .select(`
      id, submission_id, points_earned, feedback,
      submission:submissions(
        id, student_id,
        assignment:assignments(
          id, title, max_points,
          course:courses(id, title, teacher_id)
        )
      )
    `)
    .eq('id', gradeId)
    .single()

  if (gradeError || !existingGrade) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Grade not found', 404)
  }

  // Extract nested data
  const submission = Array.isArray(existingGrade.submission)
    ? existingGrade.submission[0]
    : existingGrade.submission
  const assignment = submission?.assignment
    ? (Array.isArray(submission.assignment) ? submission.assignment[0] : submission.assignment)
    : null
  const course = assignment?.course
    ? (Array.isArray(assignment.course) ? assignment.course[0] : assignment.course)
    : null

  // Authorization
  if (userRole !== UserRole.ADMIN && course?.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only update grades for your own courses',
      403
    )
  }

  // Validate points if being updated
  if (input.points_earned !== undefined && assignment) {
    if (input.points_earned > assignment.max_points) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        `Points cannot exceed assignment maximum of ${assignment.max_points}`,
        400
      )
    }
  }

  // Update grade
  const updateData: Record<string, any> = {}
  if (input.points_earned !== undefined) updateData.points_earned = input.points_earned
  if (input.feedback !== undefined) updateData.feedback = input.feedback

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('grades')
    .update(updateData)
    .eq('id', gradeId)
    .select()
    .single()

  if (updateError) {
    logger.error('Failed to update grade', { error: updateError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update grade', 500)
  }

  // Get student_id from submission
  const { data: submissionData } = await supabaseAdmin
    .from('submissions')
    .select('student_id')
    .eq('id', existingGrade.submission_id)
    .single();

  // Log grade update audit event
  if (submissionData) {
    await auditService.logGradeEvent(
      submissionData.student_id,
      AuditEventType.GRADE_UPDATED,
      gradeId,
      {
        submission_id: existingGrade.submission_id,
        old_points: existingGrade.points_earned,
        new_points: input.points_earned,
        updated_by: userId,
      }
    );

    if (assignment) {
      notifyGradeReleased(submissionData.student_id, {
        assignmentId: assignment.id,
        assignmentTitle: assignment.title || 'Assignment',
        courseName: course?.title || 'Course',
        score: updated.points_earned,
        maxScore: assignment.max_points,
      });

      if (course?.id) {
        await notifyStandingUpdated(course.id, submissionData.student_id, {
          source: 'grade_updated',
          assignmentId: assignment.id,
          submissionId: existingGrade.submission_id,
          gradeId,
        })
      }
    }
  }

  logger.info('Grade updated', { gradeId, userId })

  return updated as Grade
}

/**
 * Get grade by ID
 */
export const getGradeById = async (gradeId: string): Promise<GradeWithGrader> => {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select(`
      id, submission_id, points_earned, feedback, graded_by, graded_at,
      grader:profiles!grades_graded_by_fkey(id, email, first_name, last_name)
    `)
    .eq('id', gradeId)
    .single()

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Grade not found', 404)
  }

  // Fix nested array
  const grader = Array.isArray(data.grader) ? data.grader[0] : data.grader

  return { ...data, grader } as GradeWithGrader
}

/**
 * Get grade for a specific submission
 */
export const getGradeBySubmissionId = async (
  submissionId: string
): Promise<GradeWithGrader | null> => {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select(`
      id, submission_id, points_earned, feedback, graded_by, graded_at,
      grader:profiles!grades_graded_by_fkey(id, email, first_name, last_name)
    `)
    .eq('submission_id', submissionId)
    .single()

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to get grade', { error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get grade', 500)
  }

  if (!data) return null

  const grader = Array.isArray(data.grader) ? data.grader[0] : data.grader
  return { ...data, grader } as GradeWithGrader
}

/**
 * Delete a grade
 */
export const deleteGrade = async (
  gradeId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  // Get grade to verify ownership
  const { data: grade, error: gradeError } = await supabaseAdmin
    .from('grades')
    .select(`
      id, submission_id,
      submission:submissions(
        id, status, student_id,
        assignment:assignments(
          id, course_id,
          course:courses(id, teacher_id)
        )
      )
    `)
    .eq('id', gradeId)
    .single()

  if (gradeError || !grade) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Grade not found', 404)
  }

  // Extract nested data
  const submission = Array.isArray(grade.submission) ? grade.submission[0] : grade.submission
  const assignment = submission?.assignment
    ? (Array.isArray(submission.assignment) ? submission.assignment[0] : submission.assignment)
    : null
  const course = assignment?.course
    ? (Array.isArray(assignment.course) ? assignment.course[0] : assignment.course)
    : null
  const studentId = submission?.student_id || null
  const currentSubmissionStatus = (submission?.status as SubmissionStatus | null) ?? null

  // Authorization
  if (userRole !== UserRole.ADMIN && course?.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only delete grades for your own courses',
      403
    )
  }

  // Delete grade
  const { error: deleteError } = await supabaseAdmin
    .from('grades')
    .delete()
    .eq('id', gradeId)

  if (deleteError) {
    logger.error('Failed to delete grade', { error: deleteError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete grade', 500)
  }

  if (currentSubmissionStatus !== SubmissionStatus.UNDER_REVIEW) {
    const { error: statusError } = await supabaseAdmin
      .from('submissions')
      .update({ status: SubmissionStatus.UNDER_REVIEW })
      .eq('id', grade.submission_id)

    if (statusError) {
      logger.error('Failed to update submission status after grade deletion', {
        submissionId: grade.submission_id,
        fromStatus: currentSubmissionStatus,
        toStatus: SubmissionStatus.UNDER_REVIEW,
        error: statusError.message,
      })
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update submission status', 500)
    }

    await recordSubmissionStatusHistory(
      grade.submission_id,
      currentSubmissionStatus,
      SubmissionStatus.UNDER_REVIEW,
      userId,
      'Grade removed; submission moved back to review',
      {
        source: 'grade_service',
        grade_id: gradeId,
        removed_by: userId,
      }
    )
  }

  if (assignment?.course_id && studentId) {
    await notifyStandingUpdated(assignment.course_id, studentId, {
      source: 'grade_deleted',
      assignmentId: assignment.id,
      submissionId: grade.submission_id,
      gradeId,
    })
  }

  logger.info('Grade deleted', { gradeId, userId })
}

// ============================================
// Grade Listing & Statistics
// ============================================

/**
 * List grades for an assignment
 */
export const listAssignmentGrades = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<GradeWithSubmission[]> => {
  // Verify access
  const { data: assignment, error: assignError } = await supabaseAdmin
    .from('assignments')
    .select('id, course:courses(teacher_id)')
    .eq('id', assignmentId)
    .single()

  if (assignError || !assignment) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404)
  }

  const course = Array.isArray(assignment.course) ? assignment.course[0] : assignment.course
  if (userRole !== UserRole.ADMIN && course?.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only view grades for your own courses',
      403
    )
  }

  // Get all grades for submissions of this assignment
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select(`
      id, submission_id, points_earned, feedback, graded_by, graded_at,
      grader:profiles!grades_graded_by_fkey(id, email, first_name, last_name),
      submission:submissions!inner(
        id, assignment_id, student_id, drive_file_id, drive_file_name, drive_view_link, submitted_at, status,
        student:profiles!submissions_student_id_fkey(id, email, first_name, last_name)
      )
    `)
    .eq('submission.assignment_id', assignmentId)
    .order('graded_at', { ascending: false })

  if (error) {
    logger.error('Failed to list grades', { error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list grades', 500)
  }

  // Transform data
  return (data || []).map((item: any) => {
    const grader = Array.isArray(item.grader) ? item.grader[0] : item.grader
    const submission = Array.isArray(item.submission) ? item.submission[0] : item.submission
    const student = submission?.student
      ? (Array.isArray(submission.student) ? submission.student[0] : submission.student)
      : null

    return {
      ...item,
      grader,
      submission: { ...submission, student: undefined },
      student,
    }
  }) as GradeWithSubmission[]
}

/**
 * Get grade statistics for an assignment
 */
export const getAssignmentGradeStats = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<GradeStatistics> => {
  // Verify access
  const { data: assignment, error: assignError } = await supabaseAdmin
    .from('assignments')
    .select('id, max_points, course:courses(teacher_id)')
    .eq('id', assignmentId)
    .single()

  if (assignError || !assignment) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404)
  }

  const course = Array.isArray(assignment.course) ? assignment.course[0] : assignment.course
  if (userRole !== UserRole.ADMIN && course?.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only view stats for your own courses',
      403
    )
  }

  // Get all submissions with grades
  const { data: submissions, error: subError } = await supabaseAdmin
    .from('submissions')
    .select(`
      id, status,
      grade:grades(points_earned)
    `)
    .eq('assignment_id', assignmentId)

  if (subError) {
    logger.error('Failed to get submission stats', { error: subError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get statistics', 500)
  }

  const maxPoints = assignment.max_points
  const totalSubmissions = submissions?.length || 0
  
  // Extract grades (filter where grade exists)
  const grades: number[] = (submissions || [])
    .filter((s: any) => s.grade && s.grade.length > 0)
    .map((s: any) => {
      const grade = Array.isArray(s.grade) ? s.grade[0] : s.grade
      return grade?.points_earned || 0
    })

  const gradedCount = grades.length
  const ungradedCount = totalSubmissions - gradedCount

  // Calculate statistics
  let averagePoints: number | null = null
  let averagePercentage: number | null = null
  let highestPoints: number | null = null
  let lowestPoints: number | null = null
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }

  if (gradedCount > 0) {
    const sum = grades.reduce((a, b) => a + b, 0)
    averagePoints = Math.round((sum / gradedCount) * 100) / 100
    averagePercentage = calculatePercentage(averagePoints, maxPoints)
    highestPoints = Math.max(...grades)
    lowestPoints = Math.min(...grades)

    // Calculate distribution
    grades.forEach((points) => {
      const pct = calculatePercentage(points, maxPoints)
      const letter = calculateLetterGrade(pct)
      gradeDistribution[letter as keyof typeof gradeDistribution]++
    })
  }

  return {
    assignment_id: assignmentId,
    total_submissions: totalSubmissions,
    graded_count: gradedCount,
    ungraded_count: ungradedCount,
    average_points: averagePoints,
    average_percentage: averagePercentage,
    highest_points: highestPoints,
    lowest_points: lowestPoints,
    max_points: maxPoints,
    grade_distribution: gradeDistribution,
  }
}

// ============================================
// Bulk Operations
// ============================================

/**
 * Bulk create/update grades
 */
export const bulkGrade = async (
  input: BulkGradeInput,
  graderId: string,
  graderRole: UserRole
): Promise<{ created: number; updated: number; errors: string[] }> => {
  const results = { created: 0, updated: 0, errors: [] as string[] }

  for (const gradeInput of input.grades) {
    try {
      // Check if grade exists
      const existing = await getGradeBySubmissionId(gradeInput.submission_id)

      if (existing) {
        // Update
        await updateGrade(
          existing.id,
          { points_earned: gradeInput.points_earned, feedback: gradeInput.feedback },
          graderId,
          graderRole
        )
        results.updated++
      } else {
        // Create
        await createGrade(
          {
            submission_id: gradeInput.submission_id,
            points_earned: gradeInput.points_earned,
            feedback: gradeInput.feedback,
          },
          graderId,
          graderRole
        )
        results.created++
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      results.errors.push(`Submission ${gradeInput.submission_id}: ${msg}`)
    }
  }

  logger.info('Bulk grading completed', {
    created: results.created,
    updated: results.updated,
    errors: results.errors.length,
    graderId,
  })

  return results
}

// ============================================
// Student Grade Operations
// ============================================

/**
 * Get all grades for a student across all courses
 */
export const getStudentGrades = async (studentId: string): Promise<any[]> => {
  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn()
  const assignmentTypeField = hasAssignmentTypeColumn ? ', assignment_type' : ''

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select(`
      id,
      submitted_at,
      status,
      assignment:assignments(
        id,
        title,
        max_points,
        due_date${assignmentTypeField},
        course:courses(
          id,
          title
        )
      ),
      grade:grades(
        id,
        points_earned,
        feedback,
        graded_at
      )
    `)
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false })

  if (error) {
    if (isMissingRelationError(error)) {
      logger.warn('Grades tables missing. Returning empty grade list for student.', {
        studentId,
        error: error.message,
      })
      return []
    }

    logger.error('Failed to get student grades', { studentId, error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get grades', 500)
  }

  // Transform data to flatten the structure
  return (data || []).map((submission: any) => {
    const assignment = Array.isArray(submission.assignment) 
      ? submission.assignment[0] 
      : submission.assignment
    const course = assignment?.course
      ? (Array.isArray(assignment.course) ? assignment.course[0] : assignment.course)
      : null
    const grade = Array.isArray(submission.grade) 
      ? submission.grade[0] 
      : submission.grade

    return {
      submission_id: submission.id,
      submitted_at: submission.submitted_at,
      submission_status: submission.status,
      assignment: {
        id: assignment?.id,
        title: assignment?.title,
        max_points: assignment?.max_points,
        due_date: assignment?.due_date,
        assignment_type: normalizeAssignmentType(assignment?.assignment_type),
      },
      course: {
        id: course?.id,
        title: course?.title,
      },
      grade: grade ? {
        id: grade.id,
        points_earned: grade.points_earned,
        percentage: assignment?.max_points 
          ? calculatePercentage(grade.points_earned, assignment.max_points) 
          : null,
        letter_grade: assignment?.max_points 
          ? calculateLetterGrade(calculatePercentage(grade.points_earned, assignment.max_points))
          : null,
        feedback: grade.feedback,
        graded_at: grade.graded_at,
      } : null,
    }
  })
}

/**
 * Get weighted course grade breakdown for one student.
 * Missing categories are treated as zero contribution (deterministic policy).
 */
export const getWeightedCourseGrade = async (
  courseId: string,
  requesterId: string,
  requesterRole: UserRole,
  requestedStudentId?: string
): Promise<WeightedCourseGradeBreakdown> => {
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  if (requesterRole === UserRole.TEACHER && course.teacher_id !== requesterId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only view weighted grades for your own courses',
      403
    )
  }

  let targetStudentId = requestedStudentId

  if (requesterRole === UserRole.STUDENT) {
    if (requestedStudentId && requestedStudentId !== requesterId) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Students can only view their own weighted grade',
        403
      )
    }
    targetStudentId = requesterId
  }

  if (!targetStudentId) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'student_id is required for teacher/admin requests',
      400
    )
  }

  const { data: targetStudent, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('id', targetStudentId)
    .maybeSingle()

  if (studentError || !targetStudent) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Student not found', 404)
  }

  if (targetStudent.role !== UserRole.STUDENT) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Weighted grading is only available for student accounts',
      400
    )
  }

  const { data: enrollmentRows, error: enrollmentError } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', targetStudentId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .limit(1)

  if (enrollmentError) {
    logger.error('Failed to validate student enrollment for weighted grading', {
      courseId,
      targetStudentId,
      error: enrollmentError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load weighted grade', 500)
  }

  if (!Array.isArray(enrollmentRows) || enrollmentRows.length === 0) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'Student is not actively enrolled in this course',
      404
    )
  }

  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn()
  const assignmentTypeField = hasAssignmentTypeColumn ? ', assignment_type' : ''

  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from('assignments')
    .select(`id${assignmentTypeField}`)
    .eq('course_id', courseId)

  if (assignmentsError) {
    logger.error('Failed to fetch assignments for weighted grading', {
      courseId,
      targetStudentId,
      error: assignmentsError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load weighted grade', 500)
  }

  const assignmentTotals: Record<GradeCategory, number> = {
    exam: 0,
    quiz: 0,
    activity: 0,
  }

  for (const assignment of assignments || []) {
    const category = normalizeAssignmentCategory(
      normalizeAssignmentType((assignment as any).assignment_type)
    )
    assignmentTotals[category] += 1
  }

  const { data: grades, error: gradesError } = await supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        student_id,
        assignment:assignments!inner(
          id,
          max_points,
          course_id${assignmentTypeField}
        )
      )
    `)
    .eq('submission.student_id', targetStudentId)
    .eq('submission.assignment.course_id', courseId)

  if (gradesError) {
    logger.error('Failed to fetch grades for weighted grading', {
      courseId,
      targetStudentId,
      error: gradesError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load weighted grade', 500)
  }

  const aggregates: Record<GradeCategory, { graded_count: number; points_earned: number; points_possible: number }> = {
    exam: { graded_count: 0, points_earned: 0, points_possible: 0 },
    quiz: { graded_count: 0, points_earned: 0, points_possible: 0 },
    activity: { graded_count: 0, points_earned: 0, points_possible: 0 },
  }

  for (const row of grades || []) {
    const submission = Array.isArray((row as any).submission)
      ? (row as any).submission[0]
      : (row as any).submission
    const assignment = Array.isArray(submission?.assignment)
      ? submission.assignment[0]
      : submission?.assignment

    if (!assignment) {
      continue
    }

    const category = normalizeAssignmentCategory(
      normalizeAssignmentType(assignment.assignment_type)
    )
    const pointsEarned = Number((row as any).points_earned || 0)
    const maxPoints = Number(assignment.max_points || 0)

    aggregates[category].graded_count += 1
    aggregates[category].points_earned += pointsEarned
    aggregates[category].points_possible += maxPoints
  }

  const categories = {} as WeightedCourseGradeBreakdown['categories']
  const categoryPercentages: Partial<Record<GradeCategory, number | null>> = {}

  for (const category of GRADE_CATEGORIES) {
    const aggregate = aggregates[category]
    const rawPercentage = aggregate.points_possible > 0
      ? calculatePercentage(aggregate.points_earned, aggregate.points_possible)
      : null

    categoryPercentages[category] = rawPercentage

    categories[category] = {
      category,
      weight: COURSE_GRADE_WEIGHTS[category],
      assignment_total: assignmentTotals[category],
      graded_count: aggregate.graded_count,
      points_earned: roundToTwoDecimals(aggregate.points_earned),
      points_possible: roundToTwoDecimals(aggregate.points_possible),
      raw_percentage: rawPercentage,
      weighted_contribution: calculateWeightedContribution(rawPercentage, COURSE_GRADE_WEIGHTS[category]),
    }
  }

  const finalPercentage = calculateWeightedFinalGrade(categoryPercentages)

  return {
    course_id: courseId,
    student_id: targetStudentId,
    policy: 'missing_categories_count_as_zero',
    final_percentage: finalPercentage,
    letter_grade: calculateLetterGrade(finalPercentage),
    weights: COURSE_GRADE_WEIGHTS,
    categories,
  }
}
