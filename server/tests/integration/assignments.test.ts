/**
 * Assignment Schema & Validation Tests
 * 
 * Tests for assignment Zod schemas and validation middleware.
 */

import { describe, it, expect } from 'vitest'
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  assignmentIdParamSchema,
  courseAssignmentsParamSchema,
  listAssignmentsQuerySchema,
  createSubmissionSchema,
  updateSubmissionSchema,
  assignmentSubmissionsParamSchema,
  submissionIdParamSchema,
  createAssignmentCommentSchema,
  assignmentCommentsParamSchema,
  SubmissionStatus,
} from '../../src/types/assignments.js'

describe('Assignment Schemas', () => {
  // ============================================
  // createAssignmentSchema
  // ============================================

  describe('createAssignmentSchema', () => {
    it('should accept valid assignment data', () => {
      const result = createAssignmentSchema.safeParse({
        title: 'Test Assignment',
        description: 'Test description',
        due_date: '2024-12-31T23:59:59.000Z',
        max_points: 100,
      })

      expect(result.success).toBe(true)
    })

    it('should require title', () => {
      const result = createAssignmentSchema.safeParse({})

      expect(result.success).toBe(false)
    })

    it('should reject empty title', () => {
      const result = createAssignmentSchema.safeParse({
        title: '',
      })

      expect(result.success).toBe(false)
    })

    it('should allow optional description', () => {
      const result = createAssignmentSchema.safeParse({
        title: 'Test Assignment',
      })

      expect(result.success).toBe(true)
    })

    it('should enforce max_points between 0 and 1000', () => {
      const resultNegative = createAssignmentSchema.safeParse({
        title: 'Test',
        max_points: -1,
      })
      expect(resultNegative.success).toBe(false)

      const resultTooHigh = createAssignmentSchema.safeParse({
        title: 'Test',
        max_points: 1001,
      })
      expect(resultTooHigh.success).toBe(false)

      const resultValid = createAssignmentSchema.safeParse({
        title: 'Test',
        max_points: 500,
      })
      expect(resultValid.success).toBe(true)
    })

    it('should default max_points to 100', () => {
      const result = createAssignmentSchema.safeParse({
        title: 'Test Assignment',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.max_points).toBe(100)
      }
    })

    it('should validate due_date as ISO datetime', () => {
      const resultInvalid = createAssignmentSchema.safeParse({
        title: 'Test',
        due_date: 'not-a-date',
      })
      expect(resultInvalid.success).toBe(false)

      const resultValid = createAssignmentSchema.safeParse({
        title: 'Test',
        due_date: '2024-12-31T23:59:59.000Z',
      })
      expect(resultValid.success).toBe(true)
    })
  })

  // ============================================
  // updateAssignmentSchema
  // ============================================

  describe('updateAssignmentSchema', () => {
    it('should allow partial updates', () => {
      const result = updateAssignmentSchema.safeParse({
        title: 'Updated Title',
      })

      expect(result.success).toBe(true)
    })

    it('should allow empty object', () => {
      const result = updateAssignmentSchema.safeParse({})

      expect(result.success).toBe(true)
    })

    it('should allow nullable due_date', () => {
      const result = updateAssignmentSchema.safeParse({
        due_date: null,
      })

      expect(result.success).toBe(true)
    })
  })

  // ============================================
  // Param Schemas
  // ============================================

  describe('assignmentIdParamSchema', () => {
    it('should accept valid UUID', () => {
      const result = assignmentIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const result = assignmentIdParamSchema.safeParse({
        id: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('courseAssignmentsParamSchema', () => {
    it('should accept valid course UUID', () => {
      const result = courseAssignmentsParamSchema.safeParse({
        courseId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid course UUID', () => {
      const result = courseAssignmentsParamSchema.safeParse({
        courseId: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  // ============================================
  // listAssignmentsQuerySchema
  // ============================================

  describe('listAssignmentsQuerySchema', () => {
    it('should accept valid query params', () => {
      const result = listAssignmentsQuerySchema.safeParse({
        course_id: '123e4567-e89b-12d3-a456-426614174000',
        include_past: 'true',
        limit: 50,
        offset: 0,
      })

      expect(result.success).toBe(true)
    })

    it('should allow empty query', () => {
      const result = listAssignmentsQuerySchema.safeParse({})

      expect(result.success).toBe(true)
    })

    it('should default limit to 50', () => {
      const result = listAssignmentsQuerySchema.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(50)
      }
    })

    it('should default offset to 0', () => {
      const result = listAssignmentsQuerySchema.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.offset).toBe(0)
      }
    })

    it('should enforce limit between 1 and 100', () => {
      const resultTooLow = listAssignmentsQuerySchema.safeParse({
        limit: 0,
      })
      expect(resultTooLow.success).toBe(false)

      const resultTooHigh = listAssignmentsQuerySchema.safeParse({
        limit: 101,
      })
      expect(resultTooHigh.success).toBe(false)

      const resultValid = listAssignmentsQuerySchema.safeParse({
        limit: 100,
      })
      expect(resultValid.success).toBe(true)
    })

    it('should coerce string numbers', () => {
      const result = listAssignmentsQuerySchema.safeParse({
        limit: '25',
        offset: '10',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(25)
        expect(result.data.offset).toBe(10)
      }
    })

    it('should validate include_past as enum', () => {
      const resultValid1 = listAssignmentsQuerySchema.safeParse({
        include_past: 'true',
      })
      expect(resultValid1.success).toBe(true)

      const resultValid2 = listAssignmentsQuerySchema.safeParse({
        include_past: 'false',
      })
      expect(resultValid2.success).toBe(true)

      const resultInvalid = listAssignmentsQuerySchema.safeParse({
        include_past: 'yes',
      })
      expect(resultInvalid.success).toBe(false)
    })
  })

  // ============================================
  // Submission Schemas
  // ============================================

  describe('createSubmissionSchema', () => {
    it('should accept valid submission data', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_id: 'abc123',
        drive_file_name: 'submission.pdf',
      })

      expect(result.success).toBe(true)
    })

    it('should require drive_file_id', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_name: 'submission.pdf',
      })

      expect(result.success).toBe(false)
    })

    it('should require drive_file_name', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_id: 'abc123',
      })

      expect(result.success).toBe(false)
    })

    it('should reject empty drive_file_id', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_id: '',
        drive_file_name: 'submission.pdf',
      })

      expect(result.success).toBe(false)
    })

    it('should allow optional content', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_id: 'abc123',
        drive_file_name: 'submission.pdf',
        content: 'Optional text content',
      })

      expect(result.success).toBe(true)
    })

    it('should allow optional sync_key', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_id: 'abc123',
        drive_file_name: 'submission.pdf',
        sync_key: 'sync-123',
      })

      expect(result.success).toBe(true)
    })

    it('should reject empty sync_key', () => {
      const result = createSubmissionSchema.safeParse({
        drive_file_id: 'abc123',
        drive_file_name: 'submission.pdf',
        sync_key: '',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('updateSubmissionSchema', () => {
    it('should allow partial updates', () => {
      const result = updateSubmissionSchema.safeParse({
        drive_file_id: 'new-file-id',
      })

      expect(result.success).toBe(true)
    })

    it('should allow empty update', () => {
      const result = updateSubmissionSchema.safeParse({})

      expect(result.success).toBe(true)
    })
  })

  describe('assignmentSubmissionsParamSchema', () => {
    it('should accept valid assignmentId', () => {
      const result = assignmentSubmissionsParamSchema.safeParse({
        assignmentId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid assignmentId', () => {
      const result = assignmentSubmissionsParamSchema.safeParse({
        assignmentId: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('submissionIdParamSchema', () => {
    it('should accept valid submission UUID', () => {
      const result = submissionIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid submission UUID', () => {
      const result = submissionIdParamSchema.safeParse({
        id: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  // ============================================
  // Comment Schemas
  // ============================================

  describe('createAssignmentCommentSchema', () => {
    it('should accept valid comment content', () => {
      const result = createAssignmentCommentSchema.safeParse({
        content: 'Great work everyone. Keep going!',
      })

      expect(result.success).toBe(true)
    })

    it('should reject empty content', () => {
      const result = createAssignmentCommentSchema.safeParse({
        content: '   ',
      })

      expect(result.success).toBe(false)
    })

    it('should reject very long content', () => {
      const result = createAssignmentCommentSchema.safeParse({
        content: 'a'.repeat(5001),
      })

      expect(result.success).toBe(false)
    })
  })

  describe('assignmentCommentsParamSchema', () => {
    it('should accept valid assignmentId', () => {
      const result = assignmentCommentsParamSchema.safeParse({
        assignmentId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid assignmentId', () => {
      const result = assignmentCommentsParamSchema.safeParse({
        assignmentId: 'invalid-id',
      })

      expect(result.success).toBe(false)
    })
  })

  // ============================================
  // SubmissionStatus Enum
  // ============================================

  describe('SubmissionStatus', () => {
    it('should have expected values', () => {
      expect(SubmissionStatus.SUBMITTED).toBe('submitted')
      expect(SubmissionStatus.GRADED).toBe('graded')
      expect(SubmissionStatus.LATE).toBe('late')
    })
  })
})
