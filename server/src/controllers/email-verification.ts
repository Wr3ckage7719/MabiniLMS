import { Request, Response, NextFunction } from 'express'
import * as emailVerificationService from '../services/email-verification.js'
import * as emailService from '../services/email.js'
import * as authService from '../services/auth.js'
import { ApiError, ApiResponse, ErrorCode } from '../types/index.js'
import { VerificationResponse } from '../types/email.js'

const isTeacherFlowTokenCandidate = (token: string): boolean => /^[a-f0-9]{64}$/i.test(token.trim())

const shouldFallbackToTeacherVerification = (error: unknown, token: string): boolean => {
  if (!isTeacherFlowTokenCandidate(token)) {
    return false
  }

  if (!(error instanceof ApiError)) {
    return false
  }

  if (error.code !== ErrorCode.UNAUTHORIZED && error.code !== ErrorCode.CONFLICT) {
    return false
  }

  const normalizedMessage = (error.message || '').toLowerCase()
  return normalizedMessage.includes('verification token')
}

/**
 * @swagger
 * tags:
 *   name: Email Verification
 *   description: Email verification endpoints
 */

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify email with token
 *     tags: [Email Verification]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       401:
 *         description: Invalid or expired token
 */
export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.query

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Verification token is required',
        },
      })
      return
    }

    let result: { userId: string; email: string } | null = null
    let teacherFallbackMessage: string | null = null

    try {
      result = await emailVerificationService.verifyEmailToken(token)
    } catch (error) {
      if (!shouldFallbackToTeacherVerification(error, token)) {
        throw error
      }

      try {
        const teacherResult = await authService.verifyTeacherSignup(token)
        teacherFallbackMessage = teacherResult.message
      } catch {
        throw error
      }
    }

    if (teacherFallbackMessage) {
      const response: ApiResponse<VerificationResponse> = {
        success: true,
        data: {
          success: true,
          message: teacherFallbackMessage,
        },
      }
      res.json(response)
      return
    }

    const response: ApiResponse<VerificationResponse> = {
      success: true,
      data: {
        success: true,
        message: 'Email verified successfully',
        email: result?.email,
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     tags: [Email Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: student@mabinicolleges.edu.ph
 *     responses:
 *       200:
 *         description: Verification email sent
 *       404:
 *         description: User not found
 *       409:
 *         description: Email already verified
 */
export const resendVerificationEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body
    const baseUrl = emailService.getClientUrl()

    await emailVerificationService.resendVerificationEmail(email, baseUrl)

    const response: ApiResponse<VerificationResponse> = {
      success: true,
      data: {
        success: true,
        message: 'Verification email sent. Please check your inbox.',
        email,
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags: [Email Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: student@mabinicolleges.edu.ph
 *     responses:
 *       200:
 *         description: Password reset email sent
 */
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body
    const baseUrl = emailService.getClientUrl()

    await emailVerificationService.sendPasswordResetToken(email, baseUrl)

    // Always return success (don't reveal if email exists)
    const response: ApiResponse<VerificationResponse> = {
      success: true,
      data: {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Email Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       401:
 *         description: Invalid or expired token
 */
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, password } = req.body

    const result = await emailVerificationService.resetPasswordWithToken(token, password)

    const response: ApiResponse<VerificationResponse> = {
      success: true,
      data: {
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
        email: result.email,
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}
