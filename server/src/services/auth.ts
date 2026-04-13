import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  SignupInput,
  StudentCredentialSignupInput,
  LoginInput,
  RefreshTokenInput,
  AuthResponse,
  UserProfile,
  AuthSession,
} from '../types/auth.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import * as emailVerificationService from './email-verification.js';
import * as emailService from './email.js';
import * as auditService from './audit.js';
import { AuditEventType } from './audit.js';
import * as twoFactorService from './twoFactor.js';
import * as invitationService from './invitations.js';
import { generateTemporaryPassword, getPendingTeachersCount } from './admin.js';
import { ALLOWED_DOMAIN } from '../types/google-oauth.js';
import { notifyAdminsPendingTeacher } from './websocket.js';

const STUDENT_INSTITUTIONAL_DOMAIN = ALLOWED_DOMAIN.toLowerCase();

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getTokenSessionId = (accessToken: string): string | undefined => {
  const payload = decodeJwtPayload(accessToken);
  const maybeSessionId = payload?.session_id;
  return typeof maybeSessionId === 'string' ? maybeSessionId : undefined;
};

const createSessionProofDeviceInfo = (accessToken: string): Record<string, unknown> => {
  return {
    session_id: getTokenSessionId(accessToken) || null,
    token_hash: crypto.createHash('sha256').update(accessToken).digest('hex'),
    issued_at: new Date().toISOString(),
  };
};

const isInstitutionalStudentEmail = (email: string): boolean => {
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`);
};

const assertInstitutionalStudentEmail = (email: string, context: string): void => {
  if (!isInstitutionalStudentEmail(email)) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      `${context} requires an institutional email (@${STUDENT_INSTITUTIONAL_DOMAIN}).`,
      400
    );
  }
};

const toStudentNameFromEmail = (email: string): { firstName: string; lastName: string } => {
  const localPart = email.split('@')[0] || 'student';
  const segments = localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());

  if (segments.length === 0) {
    return { firstName: 'Student', lastName: 'User' };
  }

  if (segments.length === 1) {
    return { firstName: segments[0], lastName: 'User' };
  }

  return { firstName: segments[0], lastName: segments.slice(1).join(' ') };
};

const issueTemporaryPassword = async (userId: string, temporaryPassword: string): Promise<void> => {
  const passwordHash = crypto.createHash('sha256').update(temporaryPassword).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await supabaseAdmin
    .from('temporary_passwords')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const { error: tempPassError } = await supabaseAdmin
    .from('temporary_passwords')
    .insert({
      user_id: userId,
      temp_password_hash: passwordHash,
      must_change_password: true,
      expires_at: expiresAt.toISOString(),
    });

  if (tempPassError) {
    logger.error('Failed to issue temporary password record', {
      userId,
      error: tempPassError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to prepare temporary credentials',
      500
    );
  }
};

const getStudentSignupEmailErrorMessage = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown email error');
  const message = rawMessage.toLowerCase();

  if (
    message.includes('email provider is set to mock') ||
    message.includes('email credentials are missing') ||
    message.includes('smtp host is missing')
  ) {
    return 'Email service is not configured. Please contact the administrator.';
  }

  if (
    message.includes('invalid login') ||
    message.includes('badcredentials') ||
    message.includes('username and password not accepted') ||
    message.includes('authentication failed') ||
    message.includes('authentication unsuccessful') ||
    message.includes('535')
  ) {
    return 'Email service authentication failed. Please contact the administrator.';
  }

  if (
    message.includes('user unknown') ||
    message.includes('mailbox unavailable') ||
    message.includes('recipient address rejected') ||
    message.includes('550 5.1.1')
  ) {
    return 'The institutional inbox could not receive email. Please verify the email address and try again.';
  }

  if (message.includes('failed to send email after')) {
    return 'Could not deliver credentials email right now. Please try again in a few minutes.';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Credentials email timed out while sending. Please try again.';
  }

  return 'Could not send credentials email. Please try again.';
};

const STUDENT_SIGNUP_CREDENTIALS_MESSAGE =
  'Temporary login credentials have been sent to your institutional inbox.';

const STUDENT_SIGNUP_RESET_LINK_MESSAGE =
  'Credentials email could not be delivered, so we sent a secure password setup link instead.';

const shouldUseStudentSignupResetLinkFallback = (error: unknown): boolean => {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown email error');
  const message = rawMessage.toLowerCase();

  // Non-transient setup/auth/recipient errors should fail explicitly instead of switching flow.
  if (
    message.includes('email provider is set to mock') ||
    message.includes('email credentials are missing') ||
    message.includes('smtp host is missing') ||
    message.includes('invalid login') ||
    message.includes('badcredentials') ||
    message.includes('username and password not accepted') ||
    message.includes('authentication failed') ||
    message.includes('authentication unsuccessful') ||
    message.includes('535') ||
    message.includes('user unknown') ||
    message.includes('mailbox unavailable') ||
    message.includes('recipient address rejected') ||
    message.includes('550 5.1.1')
  ) {
    return false;
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('socket hang up') ||
    message.includes('failed to send email after')
  ) {
    return true;
  }

  return false;
};

const sendStudentSignupResetLinkFallback = async (email: string): Promise<boolean> => {
  const resetUrl = `${emailService.getClientUrl()}/auth/reset-password`;

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: resetUrl,
  });

  if (error) {
    logger.error('Student signup fallback password reset email failed', {
      email,
      error: error.message,
    });
    return false;
  }

  return true;
};

/**
 * Sign up a new user with email and password
 */
export const signup = async (input: SignupInput): Promise<AuthResponse> => {
  const { email, password, first_name, last_name, role } = input;
  const normalizedEmail = normalizeEmail(email);
  const requestedRole = role === UserRole.TEACHER ? UserRole.TEACHER : UserRole.STUDENT;

  // Check institutional email domain for students
  if (requestedRole === UserRole.STUDENT) {
    assertInstitutionalStudentEmail(normalizedEmail, 'Student signup');
  }

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    // Use explicit confirmation here because the app enforces access by role/approval policy.
    // Keeping this false causes immediate sign-in to fail right after account creation.
    email_confirm: true,
    user_metadata: {
      first_name,
      last_name,
      role: requestedRole,
    },
  });

  if (authError) {
    logger.error('Signup failed', { email, error: authError.message });
    const normalizedAuthError = authError.message.toLowerCase();
    
    if (
      normalizedAuthError.includes('already registered') ||
      normalizedAuthError.includes('already exists') ||
      normalizedAuthError.includes('duplicate')
    ) {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'A user with this email already exists',
        409
      );
    }

    if (normalizedAuthError.includes('password') || normalizedAuthError.includes('email')) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        authError.message,
        400
      );
    }
    
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      `Failed to create user account: ${authError.message}`,
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
  const isPendingTeacher = requestedRole === UserRole.TEACHER
  
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: authData.user.id,
      email: normalizedEmail,
      first_name,
      last_name,
      role: requestedRole,
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

    try {
      const pendingCount = await getPendingTeachersCount();

      notifyAdminsPendingTeacher({
        id: authData.user.id,
        name: `${first_name} ${last_name}`,
        email: normalizedEmail,
        pendingCount,
      });
    } catch (notificationError) {
      logger.error('Failed to notify admins of pending teacher signup', {
        userId: authData.user.id,
        error: notificationError instanceof Error ? notificationError.message : 'Unknown error'
      });
    }
  }

  // Send email verification
  const baseUrl = emailService.getClientUrl()
  try {
    await emailVerificationService.sendEmailVerificationToken(authData.user.id, normalizedEmail, baseUrl)
    logger.info('Verification email sent', { userId: authData.user.id, email: normalizedEmail })
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
    email: normalizedEmail,
  });

  // Teachers should wait for admin approval and are not auto-signed in.
  const shouldAutoSignIn = !isPendingTeacher;
  let session: AuthSession = {
    access_token: '',
    refresh_token: '',
    expires_in: 0,
    token_type: 'bearer',
  };

  if (shouldAutoSignIn) {
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError || !signInData.session) {
      logger.error('Auto sign-in failed after signup', {
        userId: authData.user.id,
        error: signInError?.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Account created but login failed. Please try logging in.',
        500
      );
    }

    session = {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in || 3600,
      token_type: 'bearer',
    };
  }

  // Fetch the created profile
  const profile = await getUserProfile(authData.user.id);

  return {
    user: profile,
    session,
  };
};

/**
 * Student self-signup that sends temporary credentials via email.
 */
export const requestStudentCredentialSignup = async (
  input: StudentCredentialSignupInput,
  ipAddress?: string,
  userAgent?: string
): Promise<{ message: string; delivery: 'credentials_email' | 'password_reset_link' }> => {
  const normalizedEmail = normalizeEmail(input.email);

  assertInstitutionalStudentEmail(normalizedEmail, 'Student signup');

  const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, role')
    .eq('email', normalizedEmail)
    .single();

  if (profileLookupError && profileLookupError.code !== 'PGRST116') {
    logger.error('Failed to lookup profile for student signup', {
      email: normalizedEmail,
      error: profileLookupError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to process signup request',
      500
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  let userId = '';
  let firstName = 'Student';
  let lastName = 'User';

  if (existingProfile) {
    if (existingProfile.role !== UserRole.STUDENT) {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'This email is already registered as a non-student account.',
        409
      );
    }

    userId = existingProfile.id;
    const parsedName = toStudentNameFromEmail(normalizedEmail);
    firstName = existingProfile.first_name || parsedName.firstName;
    lastName = existingProfile.last_name || parsedName.lastName;

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: UserRole.STUDENT,
      },
    });

    if (authUpdateError) {
      logger.error('Failed to reset student credentials', {
        userId,
        email: normalizedEmail,
        error: authUpdateError.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to issue student credentials',
        500
      );
    }
  } else {
    const parsedName = toStudentNameFromEmail(normalizedEmail);
    firstName = parsedName.firstName;
    lastName = parsedName.lastName;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: UserRole.STUDENT,
      },
    });

    if (authError || !authData.user) {
      logger.error('Failed to create student via self-signup', {
        email: normalizedEmail,
        error: authError?.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to create student account',
        500
      );
    }

    userId = authData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: normalizedEmail,
        first_name: firstName,
        last_name: lastName,
        role: UserRole.STUDENT,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        pending_approval: false,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      logger.error('Failed to upsert student profile during self-signup', {
        userId,
        email: normalizedEmail,
        error: profileError.message,
      });
    }
  }

  await issueTemporaryPassword(userId, temporaryPassword);

  let delivery: 'credentials_email' | 'password_reset_link' = 'credentials_email';
  const studentName = `${firstName} ${lastName}`.trim();
  try {
    await emailService.sendStudentCredentialsEmail(
      normalizedEmail,
      studentName || 'Student',
      normalizedEmail,
      temporaryPassword
    );
  } catch (emailError) {
    const safeMessage = getStudentSignupEmailErrorMessage(emailError);
    logger.error('Failed to send student credentials email', {
      userId,
      email: normalizedEmail,
      safeMessage,
      error: emailError instanceof Error ? emailError.message : 'Unknown error',
    });

    if (!shouldUseStudentSignupResetLinkFallback(emailError)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        safeMessage,
        500
      );
    }

    const fallbackSent = await sendStudentSignupResetLinkFallback(normalizedEmail);
    if (!fallbackSent) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        safeMessage,
        500
      );
    }

    delivery = 'password_reset_link';
  }

  await auditService.logAuthEvent(
    userId,
    AuditEventType.ACCOUNT_CREATED,
    ipAddress,
    userAgent,
    {
      source: 'student_self_signup',
      email: normalizedEmail,
      credentials_issued: delivery === 'credentials_email',
      fallback_reset_link: delivery === 'password_reset_link',
    }
  );

  return {
    message:
      delivery === 'credentials_email'
        ? STUDENT_SIGNUP_CREDENTIALS_MESSAGE
        : STUDENT_SIGNUP_RESET_LINK_MESSAGE,
    delivery,
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
  const { email, password, twoFactorCode, portal = 'app' } = input;
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    logger.error('Login failed', { email: normalizedEmail, error: error.message });
    
    // Try to get user ID for failed login audit (if user exists)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
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

  if (portal === 'admin' && profile.role !== UserRole.ADMIN) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      { reason: 'non_admin_admin_portal_access', role: profile.role, email: profile.email }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Administrator account required for admin portal access.',
      403
    );
  }

  if (portal === 'app' && profile.role === UserRole.ADMIN) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      { reason: 'admin_must_use_admin_portal', role: profile.role, email: profile.email }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Administrator accounts must sign in through the admin portal.',
      403
    );
  }

  if (profile.role === UserRole.STUDENT && !isInstitutionalStudentEmail(profile.email)) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      { reason: 'non_institutional_student_email', email: profile.email }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      `Student login requires an institutional email (@${STUDENT_INSTITUTIONAL_DOMAIN}).`,
      403
    );
  }

  if (profile.role === UserRole.TEACHER && profile.pending_approval === true) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      { reason: 'teacher_pending_approval', email: profile.email }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Your teacher account is pending admin approval. Please wait for approval from the admin.',
      403
    );
  }

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

  await logSessionEvent(
    data.user.id,
    'login',
    ipAddress,
    userAgent,
    createSessionProofDeviceInfo(data.session.access_token)
  );

  if (profile.role === UserRole.STUDENT) {
    const syncResult = await invitationService.syncStudentEnrollmentsOnLogin(
      data.user.id,
      profile.email
    );

    if (syncResult.pending_invitations > 0) {
      logger.info('Student login enrollment sync completed', {
        userId: data.user.id,
        email: profile.email,
        ...syncResult,
      });
    }
  }

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

  const refreshedUserId = data.user?.id || data.session.user?.id;
  if (refreshedUserId) {
    await logSessionEvent(
      refreshedUserId,
      'token_refresh',
      undefined,
      undefined,
      createSessionProofDeviceInfo(data.session.access_token)
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
  const clientUrl = emailService.getClientUrl();
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${clientUrl}/auth/reset-password`,
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
  userAgent?: string,
  deviceInfo?: Record<string, unknown>
): Promise<void> => {
  try {
    await supabaseAdmin
      .from('session_logs')
      .insert({
        user_id: userId,
        event_type: eventType,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        device_info: deviceInfo || null,
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
    .select('id, email, first_name, last_name, role, avatar_url, email_verified, email_verified_at, pending_approval, created_at, updated_at')
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
