/**
 * Grading Types & Schemas
 * 
 * Zod schemas and TypeScript interfaces for the grading system.
 */

import { z } from 'zod'
import type {
  SubmissionStorageConsistencyIssue,
  SubmissionStorageProvider,
} from './assignments.js'

// ============================================
// Zod Schemas
// ============================================

/**
 * Schema for creating a new grade
 */
export const createGradeSchema = z.object({
  submission_id: z.string().uuid('Invalid submission ID'),
  points_earned: z
    .number()
    .min(0, 'Points cannot be negative')
    .max(1000, 'Points cannot exceed 1000'),
  feedback: z.string().max(5000, 'Feedback too long').optional(),
})

/**
 * Schema for updating an existing grade
 */
export const updateGradeSchema = z.object({
  points_earned: z
    .number()
    .min(0, 'Points cannot be negative')
    .max(1000, 'Points cannot exceed 1000')
    .optional(),
  feedback: z.string().max(5000, 'Feedback too long').nullable().optional(),
})

/**
 * Schema for grade ID parameter
 */
export const gradeIdParamSchema = z.object({
  id: z.string().uuid('Invalid grade ID'),
})

/**
 * Schema for submission grade parameter
 */
export const submissionGradeParamSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
})

/**
 * Schema for assignment grades parameter
 */
export const assignmentGradesParamSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
})

/**
 * Schema for weighted course grade endpoint parameter
 */
export const courseWeightedGradeParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
})

/**
 * Schema for weighted grade query options
 */
export const weightedGradeQuerySchema = z.object({
  student_id: z.string().uuid('Invalid student ID').optional(),
})

/**
 * Schema for listing grades with optional filters
 */
export const listGradesQuerySchema = z.object({
  assignment_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  course_id: z.string().uuid().optional(),
  include_submission: z.enum(['true', 'false']).default('false'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * Schema for bulk grading (grade multiple submissions)
 */
export const bulkGradeSchema = z.object({
  grades: z.array(
    z.object({
      submission_id: z.string().uuid('Invalid submission ID'),
      points_earned: z.number().min(0).max(1000),
      feedback: z.string().max(5000).optional(),
    })
  ).min(1, 'At least one grade required').max(50, 'Maximum 50 grades per request'),
})

// ============================================
// TypeScript Types (inferred from schemas)
// ============================================

export type CreateGradeInput = z.infer<typeof createGradeSchema>
export type UpdateGradeInput = z.infer<typeof updateGradeSchema>
export type ListGradesQuery = z.infer<typeof listGradesQuerySchema>
export type BulkGradeInput = z.infer<typeof bulkGradeSchema>
export type WeightedGradeQuery = z.infer<typeof weightedGradeQuerySchema>

export const gradeCategorySchema = z.enum(['exam', 'quiz', 'activity', 'recitation', 'attendance', 'project'])
export type GradeCategory = z.infer<typeof gradeCategorySchema>

export const COURSE_GRADE_WEIGHTS: Record<GradeCategory, number> = {
  exam: 0.4,
  quiz: 0.3,
  activity: 0.3,
  recitation: 0,
  attendance: 0,
  project: 0,
}

const LEGACY_ASSIGNMENT_TYPE_TO_CATEGORY: Record<string, GradeCategory> = {
  homework: 'activity',
  project: 'project',
  discussion: 'activity',
  recitation: 'recitation',
  attendance: 'attendance',
}

export const normalizeAssignmentCategory = (assignmentType?: string | null): GradeCategory => {
  const normalized = (assignmentType || '').trim().toLowerCase()

  if (
    normalized === 'exam' ||
    normalized === 'quiz' ||
    normalized === 'activity' ||
    normalized === 'recitation' ||
    normalized === 'attendance' ||
    normalized === 'project'
  ) {
    return normalized as GradeCategory
  }

  return LEGACY_ASSIGNMENT_TYPE_TO_CATEGORY[normalized] || 'activity'
}

// ============================================
// Mabini Colleges Grade Calculation Model
// ============================================

export type MabiniGradingPeriod = 'pre_mid' | 'midterm' | 'pre_final' | 'final'

export interface MabiniPeriodWeights {
  exam: number
  quiz: number
  recitation: number
  attendance: number
  project: number
}

export const MABINI_PERIOD_WEIGHTS: MabiniPeriodWeights = {
  exam: 0.45,
  quiz: 0.15,
  recitation: 0.15,
  attendance: 0.20,
  project: 0.05,
}

export const MABINI_PERIOD_CONTRIBUTION = 0.25

export interface MabiniPeriodComponent {
  rawScore: number
  maxScore: number
  type: 'exam' | 'quiz' | 'recitation' | 'attendance' | 'project'
}

export interface MabiniPeriodResult {
  examRating: number | null
  quizRating: number | null
  recitationWeighted: number
  attendanceWeighted: number
  projectWeighted: number
  weightedGrade: number | null
  gradePoint: number | null
}

export interface MabiniOverallResult {
  preMid: MabiniPeriodResult | null
  midterm: MabiniPeriodResult | null
  preFinal: MabiniPeriodResult | null
  final: MabiniPeriodResult | null
  overallWeightedGrade: number | null
  overallGradePoint: number | null
}

/**
 * Mabini Colleges rating formula: (rawScore / maxScore) × 40 + 60
 * Used for Major Exam and Quiz components only.
 */
export const calculateMabiniRating = (rawScore: number, maxScore: number): number => {
  if (maxScore === 0) return 60
  return roundToTwoDecimals((rawScore / maxScore) * 40 + 60)
}

/**
 * Calculate weighted grade for one grading period.
 * Returns null if no graded items exist for the period.
 */
export const calculateMabiniPeriodGrade = (components: {
  examPoints?: { earned: number; possible: number } | null
  quizPoints?: { earned: number; possible: number } | null
  recitationPoints?: { earned: number; possible: number } | null
  attendancePoints?: { earned: number; possible: number } | null
  projectPoints?: { earned: number; possible: number } | null
  activityPoints?: { earned: number; possible: number } | null
}): number | null => {
  const { examPoints, quizPoints, recitationPoints, attendancePoints, projectPoints, activityPoints } = components

  const hasAny = [examPoints, quizPoints, recitationPoints, attendancePoints, projectPoints, activityPoints]
    .some(c => c && c.possible > 0)

  if (!hasAny) return null

  let total = 0

  if (examPoints && examPoints.possible > 0) {
    const rating = calculateMabiniRating(examPoints.earned, examPoints.possible)
    total += rating * MABINI_PERIOD_WEIGHTS.exam
  }

  if (quizPoints && quizPoints.possible > 0) {
    const rating = calculateMabiniRating(quizPoints.earned, quizPoints.possible)
    total += rating * MABINI_PERIOD_WEIGHTS.quiz
  }

  if (recitationPoints && recitationPoints.possible > 0) {
    const pct = (recitationPoints.earned / recitationPoints.possible) * 100
    total += pct * MABINI_PERIOD_WEIGHTS.recitation
  } else if (activityPoints && activityPoints.possible > 0 && !projectPoints?.possible) {
    // Backward-compat: 'activity' acts as recitation when no explicit recitation
    const pct = (activityPoints.earned / activityPoints.possible) * 100
    total += pct * MABINI_PERIOD_WEIGHTS.recitation
  }

  // Project takes explicit project OR falls back to activity when recitation is separate
  const effectiveProject = projectPoints?.possible ? projectPoints : null
  if (effectiveProject && effectiveProject.possible > 0) {
    const pct = (effectiveProject.earned / effectiveProject.possible) * 100
    total += pct * MABINI_PERIOD_WEIGHTS.project
  }

  if (attendancePoints && attendancePoints.possible > 0) {
    const pct = (attendancePoints.earned / attendancePoints.possible) * 100
    total += pct * MABINI_PERIOD_WEIGHTS.attendance
  }

  return roundToTwoDecimals(total)
}

/**
 * Convert a weighted percentage grade to Philippine CHED grade points.
 * Scale based on Mabini Colleges grading system.
 */
export const convertToMabiniGradePoint = (weightedGrade: number): number => {
  if (weightedGrade >= 97.5) return 1.00
  if (weightedGrade >= 94.5) return 1.25
  if (weightedGrade >= 91.5) return 1.50
  if (weightedGrade >= 88.5) return 1.75
  if (weightedGrade >= 85.5) return 2.00
  if (weightedGrade >= 82.5) return 2.25
  if (weightedGrade >= 79.5) return 2.50
  if (weightedGrade >= 76.5) return 2.75
  if (weightedGrade >= 74.5) return 3.00
  return 5.00
}

export const MABINI_GRADING_PERIOD_LABELS: Record<MabiniGradingPeriod, string> = {
  pre_mid: 'Pre-Mid',
  midterm: 'Midterm',
  pre_final: 'Pre-Final',
  final: 'Final',
}

export const MABINI_ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  exam: 'Major Exam (45%)',
  quiz: 'Quiz (15%)',
  recitation: 'Recitation (15%)',
  attendance: 'Attendance (20%)',
  project: 'Project (5%)',
  activity: 'Activity',
}

// ============================================
// Database/Response Interfaces
// ============================================

/**
 * Base grade from database
 */
export interface Grade {
  id: string
  submission_id: string
  points_earned: number
  feedback: string | null
  graded_by: string
  graded_at: string
}

/**
 * Grade with grader information
 */
export interface GradeWithGrader extends Grade {
  grader: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
  }
}

/**
 * Grade with full submission details
 */
export interface GradeWithSubmission extends GradeWithGrader {
  submission: {
    id: string
    assignment_id: string
    student_id: string
    drive_file_id: string | null
    drive_file_name: string | null
    drive_view_link: string | null
    storage_provider: SubmissionStorageProvider
    provider_file_id: string | null
    provider_revision_id: string | null
    provider_mime_type: string | null
    provider_size_bytes: number | null
    provider_checksum: string | null
    submission_snapshot_at: string | null
    provider_file_name?: string | null
    provider_view_link?: string | null
    storage_metadata_complete?: boolean
    storage_consistency_issues?: SubmissionStorageConsistencyIssue[]
    submitted_at: string
    status: string
  }
  student: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
  }
}

/**
 * Grade with assignment context (for reporting)
 */
export interface GradeWithAssignment extends GradeWithSubmission {
  assignment: {
    id: string
    title: string
    max_points: number
    due_date: string | null
    course_id: string
  }
}

/**
 * Grade statistics for an assignment
 */
export interface GradeStatistics {
  assignment_id: string
  total_submissions: number
  graded_count: number
  ungraded_count: number
  average_points: number | null
  average_percentage: number | null
  highest_points: number | null
  lowest_points: number | null
  max_points: number
  grade_distribution: {
    A: number  // 90-100%
    B: number  // 80-89%
    C: number  // 70-79%
    D: number  // 60-69%
    F: number  // <60%
  }
}

/**
 * Student grade summary for a course
 */
export interface StudentGradeSummary {
  student_id: string
  student_name: string
  student_email: string
  total_assignments: number
  graded_assignments: number
  total_points_earned: number
  total_possible_points: number
  overall_percentage: number
  letter_grade: string
}

export interface WeightedCategoryBreakdown {
  category: GradeCategory
  weight: number
  assignment_total: number
  graded_count: number
  points_earned: number
  points_possible: number
  raw_percentage: number | null
  weighted_contribution: number
}

export interface WeightedCourseGradeBreakdown {
  course_id: string
  student_id: string
  policy: 'missing_categories_count_as_zero'
  final_percentage: number
  letter_grade: string
  weights: Record<GradeCategory, number>
  categories: Record<GradeCategory, WeightedCategoryBreakdown>
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate percentage from points
 */
export const calculatePercentage = (
  pointsEarned: number,
  maxPoints: number
): number => {
  if (maxPoints === 0) return 0
  return Math.round((pointsEarned / maxPoints) * 10000) / 100 // 2 decimal places
}

export const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100
}

export const calculateWeightedContribution = (
  rawPercentage: number | null,
  weight: number
): number => {
  if (typeof rawPercentage !== 'number') {
    return 0
  }

  return roundToTwoDecimals(rawPercentage * weight)
}

export const calculateWeightedFinalGrade = (
  categoryPercentages: Partial<Record<GradeCategory, number | null>>
): number => {
  const weightedTotal = (Object.entries(COURSE_GRADE_WEIGHTS) as Array<[GradeCategory, number]>)
    .reduce((sum, [category, weight]) => {
      const percentage = categoryPercentages[category]
      if (typeof percentage !== 'number') {
        return sum
      }

      return sum + (percentage * weight)
    }, 0)

  return roundToTwoDecimals(weightedTotal)
}

/**
 * Calculate letter grade from percentage
 */
export const calculateLetterGrade = (percentage: number): string => {
  if (percentage >= 90) return 'A'
  if (percentage >= 80) return 'B'
  if (percentage >= 70) return 'C'
  if (percentage >= 60) return 'D'
  return 'F'
}

/**
 * Format grade display (e.g., "85/100 (85%) - B")
 */
export const formatGradeDisplay = (
  pointsEarned: number,
  maxPoints: number
): string => {
  const percentage = calculatePercentage(pointsEarned, maxPoints)
  const letterGrade = calculateLetterGrade(percentage)
  return `${pointsEarned}/${maxPoints} (${percentage}%) - ${letterGrade}`
}
