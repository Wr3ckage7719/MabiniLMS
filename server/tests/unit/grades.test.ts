/**
 * Grades Schema & Helper Tests
 * 
 * Tests for grade validation schemas and helper functions.
 */

import {
  createGradeSchema,
  updateGradeSchema,
  gradeIdParamSchema,
  submissionGradeParamSchema,
  assignmentGradesParamSchema,
  courseWeightedGradeParamSchema,
  weightedGradeQuerySchema,
  listGradesQuerySchema,
  bulkGradeSchema,
  COURSE_GRADE_WEIGHTS,
  calculatePercentage,
  calculateLetterGrade,
  calculateWeightedContribution,
  calculateWeightedFinalGrade,
  formatGradeDisplay,
  normalizeAssignmentCategory,
  calculateMabiniRating,
  calculateMabiniPeriodGrade,
  convertToMabiniGradePoint,
} from '../../src/types/grades.js'

// ============================================
// Schema Tests
// ============================================

describe('Grade Schemas', () => {
  describe('createGradeSchema', () => {
    it('should accept valid grade data', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: 85,
        feedback: 'Good work!',
      })

      expect(result.success).toBe(true)
    })

    it('should require submission_id', () => {
      const result = createGradeSchema.safeParse({
        points_earned: 85,
      })

      expect(result.success).toBe(false)
    })

    it('should require points_earned', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(false)
    })

    it('should validate submission_id as UUID', () => {
      const result = createGradeSchema.safeParse({
        submission_id: 'not-a-uuid',
        points_earned: 85,
      })

      expect(result.success).toBe(false)
    })

    it('should reject negative points', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: -5,
      })

      expect(result.success).toBe(false)
    })

    it('should reject points over 1000', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: 1001,
      })

      expect(result.success).toBe(false)
    })

    it('should accept decimal points', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: 85.5,
      })

      expect(result.success).toBe(true)
    })

    it('should allow optional feedback', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: 85,
      })

      expect(result.success).toBe(true)
    })

    it('should enforce feedback max length', () => {
      const result = createGradeSchema.safeParse({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: 85,
        feedback: 'a'.repeat(5001),
      })

      expect(result.success).toBe(false)
    })
  })

  describe('updateGradeSchema', () => {
    it('should allow partial updates', () => {
      const result = updateGradeSchema.safeParse({
        points_earned: 90,
      })

      expect(result.success).toBe(true)
    })

    it('should allow empty update', () => {
      const result = updateGradeSchema.safeParse({})

      expect(result.success).toBe(true)
    })

    it('should allow null feedback', () => {
      const result = updateGradeSchema.safeParse({
        feedback: null,
      })

      expect(result.success).toBe(true)
    })

    it('should validate points range', () => {
      const resultNegative = updateGradeSchema.safeParse({
        points_earned: -1,
      })
      expect(resultNegative.success).toBe(false)

      const resultTooHigh = updateGradeSchema.safeParse({
        points_earned: 1001,
      })
      expect(resultTooHigh.success).toBe(false)
    })
  })

  describe('gradeIdParamSchema', () => {
    it('should accept valid UUID', () => {
      const result = gradeIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const result = gradeIdParamSchema.safeParse({
        id: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('submissionGradeParamSchema', () => {
    it('should accept valid submission UUID', () => {
      const result = submissionGradeParamSchema.safeParse({
        submissionId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid submission UUID', () => {
      const result = submissionGradeParamSchema.safeParse({
        submissionId: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('assignmentGradesParamSchema', () => {
    it('should accept valid assignment UUID', () => {
      const result = assignmentGradesParamSchema.safeParse({
        assignmentId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid assignment UUID', () => {
      const result = assignmentGradesParamSchema.safeParse({
        assignmentId: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('courseWeightedGradeParamSchema', () => {
    it('should accept valid course UUID', () => {
      const result = courseWeightedGradeParamSchema.safeParse({
        courseId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid course UUID', () => {
      const result = courseWeightedGradeParamSchema.safeParse({
        courseId: 'invalid-course-id',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('weightedGradeQuerySchema', () => {
    it('should allow empty query', () => {
      const result = weightedGradeQuerySchema.safeParse({})

      expect(result.success).toBe(true)
    })

    it('should accept valid student_id', () => {
      const result = weightedGradeQuerySchema.safeParse({
        student_id: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid student_id', () => {
      const result = weightedGradeQuerySchema.safeParse({
        student_id: 'student-1',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('listGradesQuerySchema', () => {
    it('should allow empty query', () => {
      const result = listGradesQuerySchema.safeParse({})

      expect(result.success).toBe(true)
    })

    it('should validate optional UUIDs', () => {
      const result = listGradesQuerySchema.safeParse({
        assignment_id: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })

    it('should default limit and offset', () => {
      const result = listGradesQuerySchema.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(50)
        expect(result.data.offset).toBe(0)
      }
    })

    it('should enforce limit range', () => {
      const resultTooLow = listGradesQuerySchema.safeParse({ limit: 0 })
      expect(resultTooLow.success).toBe(false)

      const resultTooHigh = listGradesQuerySchema.safeParse({ limit: 101 })
      expect(resultTooHigh.success).toBe(false)
    })

    it('should default include_submission to false', () => {
      const result = listGradesQuerySchema.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.include_submission).toBe('false')
      }
    })
  })

  describe('bulkGradeSchema', () => {
    it('should accept valid bulk grade data', () => {
      const result = bulkGradeSchema.safeParse({
        grades: [
          {
            submission_id: '123e4567-e89b-12d3-a456-426614174000',
            points_earned: 85,
          },
          {
            submission_id: '123e4567-e89b-12d3-a456-426614174001',
            points_earned: 90,
            feedback: 'Excellent!',
          },
        ],
      })

      expect(result.success).toBe(true)
    })

    it('should require at least one grade', () => {
      const result = bulkGradeSchema.safeParse({
        grades: [],
      })

      expect(result.success).toBe(false)
    })

    it('should limit to 50 grades', () => {
      const grades = Array(51).fill({
        submission_id: '123e4567-e89b-12d3-a456-426614174000',
        points_earned: 85,
      })

      const result = bulkGradeSchema.safeParse({ grades })

      expect(result.success).toBe(false)
    })

    it('should validate each grade in array', () => {
      const result = bulkGradeSchema.safeParse({
        grades: [
          {
            submission_id: 'not-a-uuid',
            points_earned: 85,
          },
        ],
      })

      expect(result.success).toBe(false)
    })
  })
})

// ============================================
// Helper Function Tests
// ============================================

describe('Grade Helper Functions', () => {
  describe('calculatePercentage', () => {
    it('should calculate correct percentage', () => {
      expect(calculatePercentage(85, 100)).toBe(85)
      expect(calculatePercentage(45, 50)).toBe(90)
      expect(calculatePercentage(30, 40)).toBe(75)
    })

    it('should handle decimal results', () => {
      expect(calculatePercentage(1, 3)).toBe(33.33)
      expect(calculatePercentage(2, 3)).toBe(66.67)
    })

    it('should handle zero max points', () => {
      expect(calculatePercentage(0, 0)).toBe(0)
    })

    it('should handle perfect score', () => {
      expect(calculatePercentage(100, 100)).toBe(100)
    })

    it('should handle zero points earned', () => {
      expect(calculatePercentage(0, 100)).toBe(0)
    })
  })

  describe('calculateLetterGrade', () => {
    it('should return A for 90-100%', () => {
      expect(calculateLetterGrade(100)).toBe('A')
      expect(calculateLetterGrade(95)).toBe('A')
      expect(calculateLetterGrade(90)).toBe('A')
    })

    it('should return B for 80-89%', () => {
      expect(calculateLetterGrade(89)).toBe('B')
      expect(calculateLetterGrade(85)).toBe('B')
      expect(calculateLetterGrade(80)).toBe('B')
    })

    it('should return C for 70-79%', () => {
      expect(calculateLetterGrade(79)).toBe('C')
      expect(calculateLetterGrade(75)).toBe('C')
      expect(calculateLetterGrade(70)).toBe('C')
    })

    it('should return D for 60-69%', () => {
      expect(calculateLetterGrade(69)).toBe('D')
      expect(calculateLetterGrade(65)).toBe('D')
      expect(calculateLetterGrade(60)).toBe('D')
    })

    it('should return F for below 60%', () => {
      expect(calculateLetterGrade(59)).toBe('F')
      expect(calculateLetterGrade(50)).toBe('F')
      expect(calculateLetterGrade(0)).toBe('F')
    })
  })

  describe('normalizeAssignmentCategory', () => {
    it('should keep canonical assignment categories', () => {
      expect(normalizeAssignmentCategory('exam')).toBe('exam')
      expect(normalizeAssignmentCategory('quiz')).toBe('quiz')
      expect(normalizeAssignmentCategory('activity')).toBe('activity')
      expect(normalizeAssignmentCategory('recitation')).toBe('recitation')
      expect(normalizeAssignmentCategory('attendance')).toBe('attendance')
      expect(normalizeAssignmentCategory('project')).toBe('project')
    })

    it('should map legacy assignment types to their canonical category', () => {
      expect(normalizeAssignmentCategory('homework')).toBe('activity')
      expect(normalizeAssignmentCategory('discussion')).toBe('activity')
    })

    it('should fallback unknown values to activity', () => {
      expect(normalizeAssignmentCategory('unknown-type')).toBe('activity')
      expect(normalizeAssignmentCategory(undefined)).toBe('activity')
      expect(normalizeAssignmentCategory(null)).toBe('activity')
    })
  })

  describe('calculateWeightedContribution', () => {
    it('should return weighted contribution with two decimals', () => {
      expect(calculateWeightedContribution(87.5, COURSE_GRADE_WEIGHTS.exam)).toBe(35)
      expect(calculateWeightedContribution(83.33, COURSE_GRADE_WEIGHTS.quiz)).toBe(25)
    })

    it('should return zero for missing category percentage', () => {
      expect(calculateWeightedContribution(null, COURSE_GRADE_WEIGHTS.activity)).toBe(0)
    })
  })

  describe('calculateWeightedFinalGrade', () => {
    it('should apply fixed 40/30/30 weights', () => {
      const weighted = calculateWeightedFinalGrade({
        exam: 80,
        quiz: 90,
        activity: 100,
      })

      // 80*0.4 + 90*0.3 + 100*0.3 = 89
      expect(weighted).toBe(89)
    })

    it('should treat missing categories as zero contribution', () => {
      const weighted = calculateWeightedFinalGrade({
        exam: 100,
      })

      expect(weighted).toBe(40)
    })
  })

  describe('formatGradeDisplay', () => {
    it('should format grade correctly', () => {
      expect(formatGradeDisplay(85, 100)).toBe('85/100 (85%) - B')
      expect(formatGradeDisplay(95, 100)).toBe('95/100 (95%) - A')
      expect(formatGradeDisplay(45, 50)).toBe('45/50 (90%) - A')
    })

    it('should handle failing grades', () => {
      expect(formatGradeDisplay(50, 100)).toBe('50/100 (50%) - F')
    })

    it('should handle perfect scores', () => {
      expect(formatGradeDisplay(100, 100)).toBe('100/100 (100%) - A')
    })
  })
})

// ============================================
// Mabini Colleges 4-period model tests
// ============================================
//
// Reference values cross-checked against TTH 1-2_30PM.xlsx
// (instructor: VENANCIO C. DIANO; PROF ED 3, 2nd Year, 1st Sem 2023-2024).
// Per-period sheet row 14 establishes weights:
//   Major Exam 0.45, Quiz 0.15, Recitation 0.15, Attendance 0.20, Project 0.05.
// Excel formulas:
//   Rating = raw / max * 40 + 60   (exam, quiz)
//   Recit/Attend/Project = raw * weight (raw scored on 0-100 scale)
//   Period Weighted = sum of all weighted contributions
//   Overall = (PreMid + Midterm + PreFinal + Final) * 0.25
// Grade-point lookup table (row 12 onward in OVERALL RATING sheet):
//   ≥97.5→1.00, ≥94.5→1.25, ≥91.5→1.50, ≥88.5→1.75, ≥85.5→2.00,
//   ≥82.5→2.25, ≥79.5→2.50, ≥76.5→2.75, ≥74.5→3.00, <74.5→5.00.

describe('Mabini Colleges Grading Model', () => {
  describe('calculateMabiniRating', () => {
    it('matches the (raw/max)*40+60 formula in the workbook', () => {
      expect(calculateMabiniRating(81, 100)).toBe(92.4)
      expect(calculateMabiniRating(86, 100)).toBe(94.4)
      expect(calculateMabiniRating(82, 100)).toBe(92.8)
    })

    it('returns 60 (the Excel floor) when max is zero', () => {
      expect(calculateMabiniRating(0, 0)).toBe(60)
    })

    it('caps at 100 for a perfect raw score', () => {
      expect(calculateMabiniRating(100, 100)).toBe(100)
    })

    it('hits 60 for a zero raw score (Excel min rating)', () => {
      expect(calculateMabiniRating(0, 100)).toBe(60)
    })
  })

  describe('calculateMabiniPeriodGrade', () => {
    it('reproduces row 15 of the Pre-Mid sheet (Abarca, Nicole Kate)', () => {
      // Excel inputs: exam=81/100, quiz=85/100, recit=90/100, attend=100/100, project=80/100
      // Excel result: 41.58 + 14.10 + 13.50 + 20.00 + 4.00 = 93.18
      const result = calculateMabiniPeriodGrade({
        examPoints: { earned: 81, possible: 100 },
        quizPoints: { earned: 85, possible: 100 },
        recitationPoints: { earned: 90, possible: 100 },
        attendancePoints: { earned: 100, possible: 100 },
        projectPoints: { earned: 80, possible: 100 },
      })
      expect(result).toBe(93.18)
    })

    it('reproduces row 16 of the Pre-Mid sheet (Campo, Lovely Mae N.)', () => {
      const result = calculateMabiniPeriodGrade({
        examPoints: { earned: 86, possible: 100 },
        quizPoints: { earned: 82, possible: 100 },
        recitationPoints: { earned: 90, possible: 100 },
        attendancePoints: { earned: 100, possible: 100 },
        projectPoints: { earned: 80, possible: 100 },
      })
      // Excel result: 42.48 + 13.92 + 13.50 + 20.00 + 4.00 = 93.90
      expect(result).toBe(93.9)
    })

    it('returns null when no graded items exist for the period', () => {
      expect(calculateMabiniPeriodGrade({})).toBeNull()
    })

    it('falls back to activity as recitation when no project component is present', () => {
      const result = calculateMabiniPeriodGrade({
        examPoints: { earned: 100, possible: 100 },
        activityPoints: { earned: 90, possible: 100 },
      })
      // Exam: 100*0.45 = 45, activity-as-recit: 90*0.15 = 13.5 → 58.5
      expect(result).toBe(58.5)
    })

    it('handles partial period inputs (only exam graded so far)', () => {
      const result = calculateMabiniPeriodGrade({
        examPoints: { earned: 90, possible: 100 },
      })
      // Rating = 90/100*40+60 = 96, weighted = 96*0.45 = 43.2
      expect(result).toBe(43.2)
    })
  })

  describe('convertToMabiniGradePoint', () => {
    it('returns the registrar grade-point for each boundary in the lookup table', () => {
      // Exact boundaries (≥) — verified row-for-row in OVERALL RATING sheet col P/Q.
      expect(convertToMabiniGradePoint(100)).toBe(1.0)
      expect(convertToMabiniGradePoint(97.5)).toBe(1.0)
      expect(convertToMabiniGradePoint(97.49)).toBe(1.25)
      expect(convertToMabiniGradePoint(94.5)).toBe(1.25)
      expect(convertToMabiniGradePoint(94.49)).toBe(1.5)
      expect(convertToMabiniGradePoint(91.5)).toBe(1.5)
      expect(convertToMabiniGradePoint(91.49)).toBe(1.75)
      expect(convertToMabiniGradePoint(88.5)).toBe(1.75)
      expect(convertToMabiniGradePoint(88.49)).toBe(2.0)
      expect(convertToMabiniGradePoint(85.5)).toBe(2.0)
      expect(convertToMabiniGradePoint(85.49)).toBe(2.25)
      expect(convertToMabiniGradePoint(82.5)).toBe(2.25)
      expect(convertToMabiniGradePoint(82.49)).toBe(2.5)
      expect(convertToMabiniGradePoint(79.5)).toBe(2.5)
      expect(convertToMabiniGradePoint(79.49)).toBe(2.75)
      expect(convertToMabiniGradePoint(76.5)).toBe(2.75)
      expect(convertToMabiniGradePoint(76.49)).toBe(3.0)
      expect(convertToMabiniGradePoint(74.5)).toBe(3.0)
      expect(convertToMabiniGradePoint(74.49)).toBe(5.0)
      expect(convertToMabiniGradePoint(0)).toBe(5.0)
    })

    it('matches the FINAL GRADE column for the workbook sample row', () => {
      // 93.18 (row 15 weighted) → falls in [91.5, 94.5) → 1.50
      expect(convertToMabiniGradePoint(93.18)).toBe(1.5)
      // 93.9 (row 16 weighted) → also 1.50
      expect(convertToMabiniGradePoint(93.9)).toBe(1.5)
    })
  })

  describe('overall grade composition', () => {
    it('averages four equal-weight periods (×0.25 each)', () => {
      const periods = [93.18, 84.1, 85.37, 80.0]
      const sum = periods.reduce((acc, p) => acc + p * 0.25, 0)
      // Overall = 23.295 + 21.025 + 21.3425 + 20 = 85.6625
      expect(Math.round(sum * 100) / 100).toBe(85.66)
      expect(convertToMabiniGradePoint(85.66)).toBe(2.0)
    })
  })
})
