import { z } from 'zod'

/**
 * Email Verification Schemas
 */

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
})

export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const sendPasswordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[!@#$%^&*]/, 'Password must contain at least one special character'),
})

/**
 * Types
 */

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
export type SendPasswordResetInput = z.infer<typeof sendPasswordResetSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export interface EmailVerificationToken {
  id: string
  user_id: string
  token: string
  expires_at: Date
  created_at: Date
  used_at?: Date
}

export interface PasswordResetToken {
  id: string
  user_id: string
  token: string
  expires_at: Date
  created_at: Date
  used_at?: Date
}

export interface VerificationResponse {
  success: boolean
  message: string
  email?: string
}
