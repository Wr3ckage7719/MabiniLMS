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
    })

    it('should map legacy assignment types to activity', () => {
      expect(normalizeAssignmentCategory('homework')).toBe('activity')
      expect(normalizeAssignmentCategory('project')).toBe('activity')
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
