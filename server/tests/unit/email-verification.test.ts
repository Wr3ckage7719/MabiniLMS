import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as emailVerificationService from '../../src/services/email-verification.js'
import * as emailService from '../../src/services/email.js'
import { supabaseAdmin } from '../../src/lib/supabase.js'
import { ApiError } from '../../src/types/index.js'

// Mock email service
vi.mock('../../src/services/email.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))

describe('Email Verification Service', () => {
  describe('generateEmailToken', () => {
    it('should generate a valid 64-character hex token', () => {
      const token = emailVerificationService.generateEmailToken()
      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should generate unique tokens', () => {
      const token1 = emailVerificationService.generateEmailToken()
      const token2 = emailVerificationService.generateEmailToken()
      expect(token1).not.toBe(token2)
    })
  })

  describe('sendEmailVerificationToken', () => {
    const mockUserId = '123e4567-e89b-12d3-a456-426614174000'
    const mockEmail = 'test@example.com'
    const baseUrl = 'http://localhost:5173'

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should create verification token and send email', async () => {
      // Mock Supabase insert
      const mockInsert = vi.fn().mockResolvedValue({ data: {}, error: null })
      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        insert: mockInsert,
      } as any)

      await emailVerificationService.sendEmailVerificationToken(mockUserId, mockEmail, baseUrl)

      expect(mockInsert).toHaveBeenCalled()
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        mockEmail,
        expect.stringContaining('token=')
      )
    })

    it('should throw error if token creation fails', async () => {
      // Mock Supabase error
      const mockInsert = vi.fn().mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      })
      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        insert: mockInsert,
      } as any)

      await expect(
        emailVerificationService.sendEmailVerificationToken(mockUserId, mockEmail, baseUrl)
      ).rejects.toThrow(ApiError)
    })
  })

  describe('verifyEmailToken', () => {
    it('should mark token as used and verify email', async () => {
      const mockToken = 'valid-token'
      const mockUserId = '123e4567-e89b-12d3-a456-426614174000'
      const mockEmail = 'test@example.com'

      // Mock token query
      const mockTokenQuery = vi.fn().mockResolvedValue({
        data: {
          user_id: mockUserId,
          expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          used_at: null,
        },
        error: null,
      })

      // Mock token update
      const mockTokenUpdate = vi.fn().mockResolvedValue({ error: null })

      // Mock profile query
      const mockProfileQuery = vi.fn().mockResolvedValue({
        data: { email: mockEmail },
        error: null,
      })

      // Mock profile update
      const mockProfileUpdate = vi.fn().mockResolvedValue({ error: null })

      vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
        if (table === 'email_verification_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: mockTokenQuery,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: mockTokenUpdate,
            }),
          } as any
        } else if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: mockProfileQuery,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: mockProfileUpdate,
            }),
          } as any
        }
        return {} as any
      })

      const result = await emailVerificationService.verifyEmailToken(mockToken)

      expect(result).toEqual({
        userId: mockUserId,
        email: mockEmail,
      })
    })

    it('should throw error for invalid token', async () => {
      const mockTokenQuery = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockTokenQuery,
          }),
        }),
      } as any)

      await expect(
        emailVerificationService.verifyEmailToken('invalid-token')
      ).rejects.toThrow(ApiError)
    })

    it('should throw error for already used token', async () => {
      const mockTokenQuery = vi.fn().mockResolvedValue({
        data: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          used_at: new Date().toISOString(), // Already used
        },
        error: null,
      })

      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockTokenQuery,
          }),
        }),
      } as any)

      await expect(
        emailVerificationService.verifyEmailToken('used-token')
      ).rejects.toThrow('already been used')
    })

    it('should throw error for expired token', async () => {
      const mockTokenQuery = vi.fn().mockResolvedValue({
        data: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
          used_at: null,
        },
        error: null,
      })

      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockTokenQuery,
          }),
        }),
      } as any)

      await expect(
        emailVerificationService.verifyEmailToken('expired-token')
      ).rejects.toThrow('expired')
    })
  })

  describe('resendVerificationEmail', () => {
    const mockEmail = 'test@example.com'
    const baseUrl = 'http://localhost:5173'

    it('should throw error if user not found', async () => {
      const mockProfileQuery = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockProfileQuery,
          }),
        }),
      } as any)

      await expect(
        emailVerificationService.resendVerificationEmail(mockEmail, baseUrl)
      ).rejects.toThrow('User not found')
    })

    it('should throw error if email already verified', async () => {
      const mockProfileQuery = vi.fn().mockResolvedValue({
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email_verified: true, // Already verified
        },
        error: null,
      })

      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockProfileQuery,
          }),
        }),
      } as any)

      await expect(
        emailVerificationService.resendVerificationEmail(mockEmail, baseUrl)
      ).rejects.toThrow('already verified')
    })
  })

  describe('resetPasswordWithToken', () => {
    it('should update password and mark token as used', async () => {
      const mockToken = 'reset-token'
      const mockUserId = '123e4567-e89b-12d3-a456-426614174000'
      const mockEmail = 'test@example.com'
      const newPassword = 'NewSecure123!'

      // Mock token query
      const mockTokenQuery = vi.fn().mockResolvedValue({
        data: {
          user_id: mockUserId,
          expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          used_at: null,
        },
        error: null,
      })

      // Mock token update
      const mockTokenUpdate = vi.fn().mockResolvedValue({ error: null })

      // Mock profile query
      const mockProfileQuery = vi.fn().mockResolvedValue({
        data: { email: mockEmail },
        error: null,
      })

      // Mock Supabase auth update
      vi.spyOn(supabaseAdmin.auth.admin, 'updateUserById').mockResolvedValue({
        data: { user: null } as any,
        error: null,
      })

      vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
        if (table === 'password_reset_tokens') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: mockTokenQuery,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: mockTokenUpdate,
            }),
          } as any
        } else if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: mockProfileQuery,
              }),
            }),
          } as any
        }
        return {} as any
      })

      const result = await emailVerificationService.resetPasswordWithToken(mockToken, newPassword)

      expect(result).toEqual({
        userId: mockUserId,
        email: mockEmail,
      })
      expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(mockUserId, {
        password: newPassword,
      })
    })

    it('should throw error for invalid reset token', async () => {
      const mockTokenQuery = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockTokenQuery,
          }),
        }),
      } as any)

      await expect(
        emailVerificationService.resetPasswordWithToken('invalid-token', 'NewPassword123!')
      ).rejects.toThrow('Invalid reset token')
    })
  })
})
