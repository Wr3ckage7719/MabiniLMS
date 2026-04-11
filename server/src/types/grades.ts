/**
 * Grading Types & Schemas
 * 
 * Zod schemas and TypeScript interfaces for the grading system.
 */

import { z } from 'zod'

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

export const gradeCategorySchema = z.enum(['exam', 'quiz', 'activity'])
export type GradeCategory = z.infer<typeof gradeCategorySchema>

export const COURSE_GRADE_WEIGHTS: Record<GradeCategory, number> = {
  exam: 0.4,
  quiz: 0.3,
  activity: 0.3,
}

const LEGACY_ASSIGNMENT_TYPE_TO_CATEGORY: Record<string, GradeCategory> = {
  homework: 'activity',
  project: 'activity',
  discussion: 'activity',
}

export const normalizeAssignmentCategory = (assignmentType?: string | null): GradeCategory => {
  const normalized = (assignmentType || '').trim().toLowerCase()

  if (normalized === 'exam' || normalized === 'quiz' || normalized === 'activity') {
    return normalized
  }

  return LEGACY_ASSIGNMENT_TYPE_TO_CATEGORY[normalized] || 'activity'
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
