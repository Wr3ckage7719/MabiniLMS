import { randomBytes } from 'crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode } from '../types/index.js'
import * as emailService from './email.js'
import logger from '../utils/logger.js'

/**
 * Generate a secure token for email verification
 */
export const generateEmailToken = (): string => {
  return randomBytes(32).toString('hex')
}

/**
 * Create email verification token and send email
 */
export const sendEmailVerificationToken = async (
  userId: string,
  email: string,
  baseUrl: string
): Promise<void> => {
  const token = generateEmailToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Store token in database
  const { error: createError } = await supabaseAdmin
    .from('email_verification_tokens')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
    })

  if (createError) {
    logger.error('Failed to create email verification token', { error: createError.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to generate verification token',
      500
    )
  }

  // Send verification email
  const verificationLink = `${baseUrl}/auth/verify-email?token=${token}`
  await emailService.sendVerificationEmail(email, verificationLink)

  logger.error(`Verification email sent to ${email}`)
}

/**
 * Verify email token and mark email as verified
 */
export const verifyEmailToken = async (token: string): Promise<{
  userId: string
  email: string
}> => {
  // Find token in database
  const { data: tokenData, error: queryError } = await supabaseAdmin
    .from('email_verification_tokens')
    .select('user_id, expires_at, used_at')
    .eq('token', token)
    .single()

  if (queryError || !tokenData) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid verification token',
      401
    )
  }

  // Check if token has already been used
  if (tokenData.used_at) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'This verification token has already been used',
      409
    )
  }

  // Check if token has expired
  const expiresAt = new Date(tokenData.expires_at)
  if (expiresAt < new Date()) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Verification token has expired. Please request a new one.',
      401
    )
  }

  // Mark token as used
  const { error: updateError } = await supabaseAdmin
    .from('email_verification_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)

  if (updateError) {
    logger.error('Failed to mark verification token as used', { error: updateError.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify email',
      500
    )
  }

  // Get user email
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', tokenData.user_id)
    .single()

  if (profileError || !profile) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    )
  }

  // Mark email as verified in profile
  const { error: verifyError } = await supabaseAdmin
    .from('profiles')
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenData.user_id)

  if (verifyError) {
    logger.error('Failed to update profile with verified email', { error: verifyError.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify email',
      500
    )
  }

  logger.error(`Email verified for user ${tokenData.user_id}`)

  return {
    userId: tokenData.user_id,
    email: profile.email,
  }
}

/**
 * Check if user email is verified
 */
export const isEmailVerified = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('email_verified')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return false
  }

  return data.email_verified === true
}

/**
 * Resend verification email
 */
export const resendVerificationEmail = async (
  email: string,
  baseUrl: string
): Promise<void> => {
  // Find user by email
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email_verified')
    .eq('email', email)
    .single()

  if (profileError || !profile) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    )
  }

  // Check if already verified
  if (profile.email_verified) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'Email is already verified',
      409
    )
  }

  // Delete any existing unused tokens
  await supabaseAdmin
    .from('email_verification_tokens')
    .delete()
    .eq('user_id', profile.id)
    .is('used_at', null)

  // Send new verification email
  await sendEmailVerificationToken(profile.id, email, baseUrl)
}

/**
 * Generate password reset token and send email
 */
export const sendPasswordResetToken = async (
  email: string,
  baseUrl: string
): Promise<void> => {
  // Find user by email
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name')
    .eq('email', email)
    .single()

  if (profileError || !profile) {
    // Don't reveal if email exists (security best practice)
    logger.error(`Password reset requested for non-existent email: ${email}`)
    return
  }

  const token = generateEmailToken()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Store token in database
  const { error: createError } = await supabaseAdmin
    .from('password_reset_tokens')
    .insert({
      user_id: profile.id,
      token,
      expires_at: expiresAt.toISOString(),
    })

  if (createError) {
    logger.error('Failed to create password reset token', { error: createError.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to generate reset token',
      500
    )
  }

  // Send password reset email
  const resetLink = `${baseUrl}/auth/reset-password?token=${token}`
  await emailService.sendPasswordResetEmail(email, resetLink)

  logger.error(`Password reset email sent to ${email}`)
}

/**
 * Verify password reset token and update password
 */
export const resetPasswordWithToken = async (token: string, newPassword: string): Promise<{
  userId: string
  email: string
}> => {
  // Find token in database
  const { data: tokenData, error: queryError } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('user_id, expires_at, used_at')
    .eq('token', token)
    .single()

  if (queryError || !tokenData) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid reset token',
      401
    )
  }

  // Check if token has already been used
  if (tokenData.used_at) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'This password reset token has already been used',
      409
    )
  }

  // Check if token has expired
  const expiresAt = new Date(tokenData.expires_at)
  if (expiresAt < new Date()) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Password reset token has expired. Please request a new one.',
      401
    )
  }

  // Mark token as used
  const { error: updateError } = await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)

  if (updateError) {
    logger.error('Failed to mark reset token as used', { error: updateError.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to reset password',
      500
    )
  }

  // Update user password via Supabase Auth
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
    tokenData.user_id,
    { password: newPassword }
  )

  if (passwordError) {
    logger.error('Failed to update password', { error: passwordError.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to reset password',
      500
    )
  }

  // Get user email
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', tokenData.user_id)
    .single()

  if (profileError || !profile) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    )
  }

  logger.error(`Password reset for user ${tokenData.user_id}`)

  return {
    userId: tokenData.user_id,
    email: profile.email,
  }
}
