/**
 * Analytics Service
 * 
 * Provides analytics data for courses, students, and overall platform metrics.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode, UserRole } from '../types/index.js'
import { calculatePercentage, calculateLetterGrade } from '../types/grades.js'

// ============================================
// Types
// ============================================

export interface CourseAnalytics {
  course_id: string
  course_title: string
  enrollment_count: number
  material_count: number
  assignment_count: number
  submission_stats: {
    total: number
    graded: number
    pending: number
    late: number
  }
  grade_stats: {
    average: number | null
    highest: number | null
    lowest: number | null
    distribution: Record<string, number>
  }
  engagement: {
    active_students: number
    completion_rate: number
  }
}

export interface StudentAnalytics {
  student_id: string
  student_name: string
  enrolled_courses: number
  total_assignments: number
  completed_assignments: number
  average_grade: number | null
  grade_distribution: Record<string, number>
  recent_activity: {
    last_submission: string | null
    submissions_this_week: number
  }
}

export interface PlatformAnalytics {
  users: {
    total: number
    by_role: Record<string, number>
    new_this_week: number
    new_this_month: number
  }
  courses: {
    total: number
    published: number
    draft: number
    archived: number
  }
  enrollments: {
    total: number
    active: number
    completed: number
    new_this_week: number
  }
  assignments: {
    total: number
    due_this_week: number
    overdue: number
  }
  submissions: {
    total: number
    this_week: number
    pending_grading: number
  }
}

export interface TeacherAnalytics {
  teacher_id: string
  courses_taught: number
  total_students: number
  assignments_created: number
  pending_grading: number
  average_grade_given: number | null
  recent_activity: {
    grades_this_week: number
    materials_added_this_week: number
  }
}

// ============================================
// Course Analytics
// ============================================

/**
 * Get analytics for a specific course
 */
export const getCourseAnalytics = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<CourseAnalytics> => {
  // Verify access
  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('id, title, teacher_id')
    .eq('id', courseId)
    .single()

  if (!course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied', 403)
  }

  // Get enrollment count
  const { count: enrollmentCount } = await supabaseAdmin
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('status', 'active')

  // Get material count
  const { count: materialCount } = await supabaseAdmin
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)

  // Get assignment count
  const { count: assignmentCount } = await supabaseAdmin
    .from('assignments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)

  // Get submission stats
  const { data: submissions } = await supabaseAdmin
    .from('submissions')
    .select(`
      id, 
      status,
      assignment:assignments!inner(course_id)
    `)
    .eq('assignment.course_id', courseId)

  const submissionStats = {
    total: submissions?.length || 0,
    graded: submissions?.filter((s) => s.status === 'graded').length || 0,
    pending: submissions?.filter((s) => s.status === 'submitted').length || 0,
    late: submissions?.filter((s) => s.status === 'late').length || 0,
  }

  // Get grade stats
  const { data: grades } = await supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        assignment:assignments!inner(course_id, max_points)
      )
    `)
    .eq('submission.assignment.course_id', courseId)

  let gradeStats: CourseAnalytics['grade_stats'] = {
    average: null,
    highest: null,
    lowest: null,
    distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
  }

  if (grades && grades.length > 0) {
    const percentages = grades.map((g: any) => {
      const submission = Array.isArray(g.submission) ? g.submission[0] : g.submission
      const assignment = Array.isArray(submission?.assignment) ? submission.assignment[0] : submission?.assignment
      return calculatePercentage(g.points_earned, assignment?.max_points || 100)
    })

    gradeStats.average = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length * 100) / 100
    gradeStats.highest = Math.max(...percentages)
    gradeStats.lowest = Math.min(...percentages)

    percentages.forEach((p) => {
      const letter = calculateLetterGrade(p)
      gradeStats.distribution[letter]++
    })
  }

  // Get engagement stats
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const { count: activeStudents } = await supabaseAdmin
    .from('submissions')
    .select('student_id', { count: 'exact', head: true })
    .eq('assignment.course_id', courseId)
    .gte('created_at', oneWeekAgo.toISOString())

  const completionRate = assignmentCount && enrollmentCount
    ? Math.round((submissionStats.graded / (assignmentCount * enrollmentCount)) * 100)
    : 0

  return {
    course_id: courseId,
    course_title: course.title,
    enrollment_count: enrollmentCount || 0,
    material_count: materialCount || 0,
    assignment_count: assignmentCount || 0,
    submission_stats: submissionStats,
    grade_stats: gradeStats,
    engagement: {
      active_students: activeStudents || 0,
      completion_rate: completionRate,
    },
  }
}

// ============================================
// Student Analytics
// ============================================

/**
 * Get analytics for a specific student
 */
export const getStudentAnalytics = async (
  studentId: string,
  userId: string,
  userRole: UserRole
): Promise<StudentAnalytics> => {
  // Students can only view their own analytics
  if (userRole === UserRole.STUDENT && studentId !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied', 403)
  }

  // Get student info
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', studentId)
    .single()

  if (!student) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Student not found', 404)
  }

  // Get enrolled courses count
  const { count: enrolledCourses } = await supabaseAdmin
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('status', 'active')

  // Get assignments and submissions
  const { data: enrollments } = await supabaseAdmin
    .from('enrollments')
    .select('course_id')
    .eq('student_id', studentId)
    .eq('status', 'active')

  const courseIds = enrollments?.map((e) => e.course_id) || []

  let totalAssignments = 0
  let completedAssignments = 0

  if (courseIds.length > 0) {
    const { count: assignmentCount } = await supabaseAdmin
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .in('course_id', courseIds)

    totalAssignments = assignmentCount || 0

    const { count: submissionCount } = await supabaseAdmin
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .in('status', ['submitted', 'graded', 'late'])

    completedAssignments = submissionCount || 0
  }

  // Get grades
  const { data: grades } = await supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        student_id,
        assignment:assignments!inner(max_points)
      )
    `)
    .eq('submission.student_id', studentId)

  let averageGrade: number | null = null
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }

  if (grades && grades.length > 0) {
    const percentages = grades.map((g: any) => {
      const submission = Array.isArray(g.submission) ? g.submission[0] : g.submission
      const assignment = Array.isArray(submission?.assignment) ? submission.assignment[0] : submission?.assignment
      return calculatePercentage(g.points_earned, assignment?.max_points || 100)
    })

    averageGrade = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length * 100) / 100

    percentages.forEach((p) => {
      const letter = calculateLetterGrade(p)
      gradeDistribution[letter]++
    })
  }

  // Get recent activity
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const { data: lastSubmission } = await supabaseAdmin
    .from('submissions')
    .select('created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { count: submissionsThisWeek } = await supabaseAdmin
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gte('created_at', oneWeekAgo.toISOString())

  return {
    student_id: studentId,
    student_name: `${student.first_name} ${student.last_name}`.trim(),
    enrolled_courses: enrolledCourses || 0,
    total_assignments: totalAssignments,
    completed_assignments: completedAssignments,
    average_grade: averageGrade,
    grade_distribution: gradeDistribution,
    recent_activity: {
      last_submission: lastSubmission?.created_at || null,
      submissions_this_week: submissionsThisWeek || 0,
    },
  }
}

// ============================================
// Platform Analytics (Admin only)
// ============================================

/**
 * Get platform-wide analytics
 */
export const getPlatformAnalytics = async (
  _userId: string,
  userRole: UserRole
): Promise<PlatformAnalytics> => {
  if (userRole !== UserRole.ADMIN) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Admin access required', 403)
  }

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  // User stats
  const { data: users } = await supabaseAdmin
    .from('profiles')
    .select('id, role, created_at')

  const userStats = {
    total: users?.length || 0,
    by_role: {} as Record<string, number>,
    new_this_week: users?.filter((u) => new Date(u.created_at) > oneWeekAgo).length || 0,
    new_this_month: users?.filter((u) => new Date(u.created_at) > oneMonthAgo).length || 0,
  }

  users?.forEach((u) => {
    userStats.by_role[u.role] = (userStats.by_role[u.role] || 0) + 1
  })

  // Course stats
  const { data: courses } = await supabaseAdmin
    .from('courses')
    .select('id, status')

  const courseStats = {
    total: courses?.length || 0,
    published: courses?.filter((c) => c.status === 'published').length || 0,
    draft: courses?.filter((c) => c.status === 'draft').length || 0,
    archived: courses?.filter((c) => c.status === 'archived').length || 0,
  }

  // Enrollment stats
  const { data: enrollments } = await supabaseAdmin
    .from('enrollments')
    .select('id, status, created_at')

  const enrollmentStats = {
    total: enrollments?.length || 0,
    active: enrollments?.filter((e) => e.status === 'active').length || 0,
    completed: enrollments?.filter((e) => e.status === 'completed').length || 0,
    new_this_week: enrollments?.filter((e) => new Date(e.created_at) > oneWeekAgo).length || 0,
  }

  // Assignment stats
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)

  const { data: assignments } = await supabaseAdmin
    .from('assignments')
    .select('id, due_date')

  const now = new Date()
  const assignmentStats = {
    total: assignments?.length || 0,
    due_this_week: assignments?.filter((a) => {
      const due = new Date(a.due_date)
      return due > now && due < nextWeek
    }).length || 0,
    overdue: assignments?.filter((a) => new Date(a.due_date) < now).length || 0,
  }

  // Submission stats
  const { count: totalSubmissions } = await supabaseAdmin
    .from('submissions')
    .select('*', { count: 'exact', head: true })

  const { count: submissionsThisWeek } = await supabaseAdmin
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneWeekAgo.toISOString())

  const { count: pendingGrading } = await supabaseAdmin
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .in('status', ['submitted', 'late'])

  return {
    users: userStats,
    courses: courseStats,
    enrollments: enrollmentStats,
    assignments: assignmentStats,
    submissions: {
      total: totalSubmissions || 0,
      this_week: submissionsThisWeek || 0,
      pending_grading: pendingGrading || 0,
    },
  }
}

// ============================================
// Teacher Analytics
// ============================================

/**
 * Get analytics for a teacher
 */
export const getTeacherAnalytics = async (
  teacherId: string,
  userId: string,
  userRole: UserRole
): Promise<TeacherAnalytics> => {
  // Teachers can only view their own analytics
  if (userRole !== UserRole.ADMIN && teacherId !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied', 403)
  }

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  // Get courses taught
  const { data: courses } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('teacher_id', teacherId)

  const courseIds = courses?.map((c) => c.id) || []

  // Get total students
  let totalStudents = 0
  if (courseIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('enrollments')
      .select('student_id', { count: 'exact', head: true })
      .in('course_id', courseIds)
      .eq('status', 'active')

    totalStudents = count || 0
  }

  // Get assignments created
  let assignmentsCreated = 0
  if (courseIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .in('course_id', courseIds)

    assignmentsCreated = count || 0
  }

  // Get pending grading
  let pendingGrading = 0
  if (courseIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('submissions')
      .select('*, assignment:assignments!inner(course_id)', { count: 'exact', head: true })
      .in('assignment.course_id', courseIds)
      .in('status', ['submitted', 'late'])

    pendingGrading = count || 0
  }

  // Get average grade given
  const { data: grades } = await supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        assignment:assignments!inner(course_id, max_points)
      )
    `)
    .eq('graded_by', teacherId)

  let averageGradeGiven: number | null = null
  if (grades && grades.length > 0) {
    const percentages = grades.map((g: any) => {
      const submission = Array.isArray(g.submission) ? g.submission[0] : g.submission
      const assignment = Array.isArray(submission?.assignment) ? submission.assignment[0] : submission?.assignment
      return calculatePercentage(g.points_earned, assignment?.max_points || 100)
    })

    averageGradeGiven = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length * 100) / 100
  }

  // Get recent activity
  const { count: gradesThisWeek } = await supabaseAdmin
    .from('grades')
    .select('*', { count: 'exact', head: true })
    .eq('graded_by', teacherId)
    .gte('graded_at', oneWeekAgo.toISOString())

  let materialsAddedThisWeek = 0
  if (courseIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('materials')
      .select('*', { count: 'exact', head: true })
      .in('course_id', courseIds)
      .gte('created_at', oneWeekAgo.toISOString())

    materialsAddedThisWeek = count || 0
  }

  return {
    teacher_id: teacherId,
    courses_taught: courseIds.length,
    total_students: totalStudents,
    assignments_created: assignmentsCreated,
    pending_grading: pendingGrading,
    average_grade_given: averageGradeGiven,
    recent_activity: {
      grades_this_week: gradesThisWeek || 0,
      materials_added_this_week: materialsAddedThisWeek,
    },
  }
}
