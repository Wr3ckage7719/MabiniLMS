import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  SignupInput,
  LoginInput,
  RefreshTokenInput,
  AuthResponse,
  UserProfile,
  AuthSession,
} from '../types/auth.js';
import logger from '../utils/logger.js';
import * as emailVerificationService from './email-verification.js';
import * as auditService from './audit.js';
import { AuditEventType } from './audit.js';
import * as twoFactorService from './twoFactor.js';

/**
 * Sign up a new user with email and password
 */
export const signup = async (input: SignupInput): Promise<AuthResponse> => {
  const { email, password, first_name, last_name, role } = input;

  // Check institutional email domain for students
  if (role === UserRole.STUDENT) {
    const { data: settingsData } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'institutional_email_domains')
      .single();

    const allowedDomains: string[] = settingsData?.value || [];
    
    if (allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const isValidDomain = allowedDomains.some(
        (domain: string) => emailDomain === domain.toLowerCase()
      );

      if (!isValidDomain) {
        throw new ApiError(
          ErrorCode.VALIDATION_ERROR,
          `Student signup requires an institutional email. Allowed domains: ${allowedDomains.join(', ')}`,
          400
        );
      }
    }

    // Check if student self-signup is allowed
    const { data: selfSignupData } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'allow_student_self_signup')
      .single();

    const allowSelfSignup = selfSignupData?.value ?? false;
    
    if (!allowSelfSignup) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Student accounts must be created by an administrator. Please contact your school admin.',
        403
      );
    }
  }

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // Require email verification
    user_metadata: {
      first_name,
      last_name,
      role: role || UserRole.STUDENT,
    },
  });

  if (authError) {
    logger.error('Signup failed', { email, error: authError.message });
    
    if (authError.message.includes('already registered')) {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'A user with this email already exists',
        409
      );
    }
    
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create user account',
      500
    );
  }

  if (!authData.user) {
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'User creation failed',
      500
    );
  }

  // Create or update profile in profiles table
  // For teachers, set pending_approval flag
  const isPendingTeacher = role === UserRole.TEACHER
  
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: authData.user.id,
      email,
      first_name,
      last_name,
      role: role || UserRole.STUDENT,
      email_verified: false,
      pending_approval: isPendingTeacher, // Teachers require admin approval
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (profileError) {
    logger.error('Profile creation failed', { 
      userId: authData.user.id, 
      error: profileError.message 
    });
    // Don't fail the signup, profile trigger should handle this
  }

  // Log if this is a teacher signup that requires approval
  if (isPendingTeacher) {
    logger.info('Teacher signup - pending admin approval', { 
      userId: authData.user.id, 
      email 
    })
  }

  // Send email verification
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  try {
    await emailVerificationService.sendEmailVerificationToken(authData.user.id, email, baseUrl)
    logger.info('Verification email sent', { userId: authData.user.id, email })
  } catch (emailError) {
    logger.error('Failed to send verification email', { 
      userId: authData.user.id, 
      error: emailError instanceof Error ? emailError.message : 'Unknown error'
    })
    // Don't fail signup if email fails to send
  }

  // Generate magic link (not used, but validates the user exists)
  await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  // Sign in the user to get tokens
  const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    logger.error('Auto sign-in failed after signup', { 
      userId: authData.user.id, 
      error: signInError?.message 
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Account created but login failed. Please try logging in.',
      500
    );
  }

  // Fetch the created profile
  const profile = await getUserProfile(authData.user.id);

  return {
    user: profile,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in || 3600,
      token_type: 'bearer',
    },
  };
};

/**
 * Login user with email and password
 */
export const login = async (
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResponse> => {
  const { email, password, twoFactorCode } = input;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logger.error('Login failed', { email, error: error.message });
    
    // Try to get user ID for failed login audit (if user exists)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();
    
    if (profile?.id) {
      await auditService.logAuthEvent(
        profile.id,
        AuditEventType.LOGIN_FAILED,
        ipAddress,
        userAgent,
        { reason: error.message }
      );
    }
    
    if (error.message.includes('Invalid login credentials')) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid email or password',
        401
      );
    }
    
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Authentication failed',
      401
    );
  }

  if (!data.user || !data.session) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Authentication failed',
      401
    );
  }

  // Fetch user profile
  const profile = await getUserProfile(data.user.id);

  // Check if 2FA is enabled
  const has2FA = await twoFactorService.isTwoFactorEnabled(data.user.id);
  
  if (has2FA) {
    // If 2FA is enabled but no code provided, return requires2FA flag
    if (!twoFactorCode) {
      // Sign out the session immediately (don't grant access yet)
      await supabaseAdmin.auth.admin.signOut(data.session.access_token);
      
      return {
        user: profile,
        session: {
          access_token: '',
          refresh_token: '',
          expires_in: 0,
          token_type: 'bearer',
        },
        requires2FA: true,
        tempToken: data.session.access_token, // Temp token for verification
      };
    }
    
    // Verify 2FA code
    try {
      await twoFactorService.verifyTwoFactor(
        data.user.id,
        twoFactorCode,
        ipAddress,
        userAgent
      );
    } catch (error) {
      // Sign out on failed 2FA
      await supabaseAdmin.auth.admin.signOut(data.session.access_token);
      throw error;
    }
  }

  // Log successful login
  await auditService.logAuthEvent(
    data.user.id,
    AuditEventType.LOGIN_SUCCESS,
    ipAddress,
    userAgent
  );

  // Check if email is verified (optional enforcement - can be enabled later)
  if (!profile.email_verified) {
    logger.warn('Login attempt with unverified email', { userId: data.user.id, email })
    // For now, just log a warning. To enforce verification, uncomment:
    // throw new ApiError(
    //   ErrorCode.FORBIDDEN,
    //   'Please verify your email before logging in. Check your inbox for the verification link.',
    //   403
    // );
  }

  return {
    user: profile,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in || 3600,
      token_type: 'bearer',
    },
  };
};

/**
 * Logout user by revoking their session
 */
export const logout = async (
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  // Log logout event
  await auditService.logAuthEvent(
    userId,
    AuditEventType.LOGOUT,
    ipAddress,
    userAgent
  );

  // Sign out user from Supabase
  const { error } = await supabaseAdmin.auth.admin.signOut(userId);

  if (error) {
    logger.error('Logout failed', { userId, error: error.message });
    // Don't throw error, just log it - logout should always "succeed" from user perspective
  }
};

/**
 * Refresh access token using refresh token
 */
export const refreshToken = async (input: RefreshTokenInput): Promise<AuthSession> => {
  const { refresh_token } = input;

  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token,
  });

  if (error || !data.session) {
    logger.error('Token refresh failed', { error: error?.message });
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired refresh token',
      401
    );
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in || 3600,
    token_type: 'bearer',
  };
};

/**
 * Send password reset email
 */
export const forgotPassword = async (email: string): Promise<void> => {
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password`,
  });

  if (error) {
    logger.error('Password reset request failed', { email, error: error.message });
    // Don't reveal if email exists or not for security
  }

  // Always return success to prevent email enumeration
};

/**
 * Reset password with token (called after user clicks reset link)
 */
export const resetPassword = async (
  accessToken: string,
  newPassword: string
): Promise<void> => {
  // The access token comes from the reset password link
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired reset token',
      401
    );
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (error) {
    logger.error('Password reset failed', { userId: user.id, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to reset password',
      500
    );
  }

  // Update password_changed_at to invalidate existing sessions
  await updatePasswordChangedAt(user.id);
};

/**
 * Change password for authenticated user
 */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  // First verify current password by attempting to get user session
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (!profile?.email) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    );
  }

  // Verify current password
  const { error: verifyError } = await supabaseAdmin.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });

  if (verifyError) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Current password is incorrect',
      401
    );
  }

  // Update password
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    logger.error('Password change failed', { userId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to change password',
      500
    );
  }

  // Update password_changed_at to invalidate other sessions
  await updatePasswordChangedAt(userId);
  
  // Log password change event
  await auditService.logPasswordEvent(
    userId,
    AuditEventType.PASSWORD_CHANGED,
    ipAddress,
    userAgent
  );
  
  logger.info('Password changed successfully', { userId });
};

/**
 * Update password_changed_at timestamp (invalidates existing sessions)
 */
export const updatePasswordChangedAt = async (userId: string): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ password_changed_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    logger.error('Failed to update password_changed_at', { userId, error: error.message });
    // Don't throw - this is not critical
  }
};

/**
 * Log session event
 */
export const logSessionEvent = async (
  userId: string,
  eventType: 'login' | 'logout' | 'token_refresh' | 'session_expired',
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  try {
    await supabaseAdmin
      .from('session_logs')
      .insert({
        user_id: userId,
        event_type: eventType,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
      });
  } catch (error) {
    logger.error('Failed to log session event', { userId, eventType, error });
    // Don't throw - logging failure shouldn't break auth flow
  }
};

/**
 * Get user profile by ID
 */
export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, role, avatar_url, email_verified, email_verified_at, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    logger.error('Failed to fetch user profile', { userId, error: error?.message });
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User profile not found',
      404
    );
  }

  return data as UserProfile;
};

/**
 * Get current user's profile (for authenticated requests)
 */
export const getCurrentUserProfile = async (userId: string): Promise<UserProfile> => {
  return getUserProfile(userId);
};
