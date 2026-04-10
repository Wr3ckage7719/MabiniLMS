/**
 * Invitation Schema & Validation Tests
 *
 * Tests for invitation Zod schemas.
 */

import { describe, it, expect } from 'vitest'
import {
  createInvitationSchema,
  invitationIdParamSchema,
  courseInvitationsParamSchema,
  invitationQuerySchema,
  InvitationStatus,
} from '../../src/types/invitations.js'

describe('Invitation Schemas', () => {
  describe('createInvitationSchema', () => {
    it('should accept valid invitation payload', () => {
      const result = createInvitationSchema.safeParse({
        course_id: '123e4567-e89b-12d3-a456-426614174000',
        student_email: 'Student@Example.com',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.student_email).toBe('student@example.com')
      }
    })

    it('should reject invalid email', () => {
      const result = createInvitationSchema.safeParse({
        course_id: '123e4567-e89b-12d3-a456-426614174000',
        student_email: 'invalid-email',
      })

      expect(result.success).toBe(false)
    })

    it('should reject invalid course id', () => {
      const result = createInvitationSchema.safeParse({
        course_id: 'not-a-uuid',
        student_email: 'student@example.com',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('invitationIdParamSchema', () => {
    it('should accept valid invitation id', () => {
      const result = invitationIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid invitation id', () => {
      const result = invitationIdParamSchema.safeParse({
        id: 'bad-id',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('courseInvitationsParamSchema', () => {
    it('should accept valid course id', () => {
      const result = courseInvitationsParamSchema.safeParse({
        courseId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid course id', () => {
      const result = courseInvitationsParamSchema.safeParse({
        courseId: 'bad-id',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('invitationQuerySchema', () => {
    it('should apply defaults', () => {
      const result = invitationQuerySchema.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(50)
        expect(result.data.offset).toBe(0)
      }
    })

    it('should accept valid status and pagination', () => {
      const result = invitationQuerySchema.safeParse({
        status: InvitationStatus.PENDING,
        limit: '10',
        offset: '5',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(10)
        expect(result.data.offset).toBe(5)
      }
    })

    it('should reject invalid status', () => {
      const result = invitationQuerySchema.safeParse({
        status: 'unknown',
      })

      expect(result.success).toBe(false)
    })
  })
})
