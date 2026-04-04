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

/**
 * Sign up a new user with email and password
 */
export const signup = async (input: SignupInput): Promise<AuthResponse> => {
  const { email, password, first_name, last_name, role } = input;

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
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: authData.user.id,
      email,
      first_name,
      last_name,
      role: role || UserRole.STUDENT,
      email_verified: false,
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
export const login = async (input: LoginInput): Promise<AuthResponse> => {
  const { email, password } = input;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logger.error('Login failed', { email, error: error.message });
    
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
export const logout = async (userId: string): Promise<void> => {
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
