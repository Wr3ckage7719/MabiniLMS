import { createIsolatedAuthClient, supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  SignupInput,
  StudentCredentialSignupInput,
  StudentSignupCompleteInput,
  TeacherOnboardingCompleteInput,
  LoginInput,
  RefreshTokenInput,
  AuthResponse,
  UserProfile,
  AuthSession,
} from '../types/auth.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import * as emailService from './email.js';
import * as auditService from './audit.js';
import { AuditEventType } from './audit.js';
import * as twoFactorService from './twoFactor.js';
import * as invitationService from './invitations.js';
import { getPendingTeachersCount } from './admin.js';
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

const clearTemporaryPasswordRequirement = async (userId: string): Promise<void> => {
  const clearedAt = new Date().toISOString();

  const { error: clearError } = await supabaseAdmin
    .from('temporary_passwords')
    .update({
      used_at: clearedAt,
      must_change_password: false,
    })
    .eq('user_id', userId)
    .is('used_at', null);

  if (clearError) {
    logger.warn('Failed to clear temporary password requirement', {
      userId,
      error: clearError.message,
    });
  }
};

const STUDENT_SIGNUP_GENERIC_MESSAGE =
  'If eligible, an account setup link has been sent to your institutional inbox.';

const STUDENT_SIGNUP_COMPLETE_MESSAGE =
  'Your student account is ready. You can now sign in with your email and password.';

const TEACHER_SIGNUP_GENERIC_MESSAGE =
  'If eligible, a verification link has been sent to your email. Verify first, then wait for admin approval.';

const TEACHER_SIGNUP_VERIFIED_MESSAGE =
  'Your email is verified. Your teacher application is now pending administrator review.';

const TEACHER_ONBOARDING_COMPLETE_MESSAGE =
  'Your teacher account is ready. You can now sign in with your email and password.';

const STUDENT_SIGNUP_CHALLENGE_TTL_MS = 30 * 60 * 1000;
const STUDENT_SIGNUP_COOLDOWN_MS = 5 * 60 * 1000;
const STUDENT_SIGNUP_DAILY_CAP = 5;
const TEACHER_SIGNUP_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const TWO_FACTOR_LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;

type StudentSignupChallenge = {
  id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type TeacherApplication = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: 'pending_email_verification' | 'pending_review' | 'approved' | 'rejected';
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  onboarding_token_hash: string | null;
  onboarding_expires_at: string | null;
  onboarding_used_at: string | null;
  linked_user_id: string | null;
};

type TwoFactorLoginChallenge = {
  id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

const isNotFoundError = (error: { code?: string } | null): boolean => {
  return error?.code === 'PGRST116';
};

const generateFlowToken = (): string => crypto.randomBytes(32).toString('hex');

const hashFlowToken = (token: string): string => {
  const decodedToken = (() => {
    try {
      return decodeURIComponent(token);
    } catch {
      return token;
    }
  })();

  return crypto.createHash('sha256').update(decodedToken.trim()).digest('hex');
};

const getNormalizedName = (
  firstName: string | undefined,
  lastName: string | undefined,
  email: string
): { firstName: string; lastName: string } => {
  const trimmedFirstName = (firstName || '').trim();
  const trimmedLastName = (lastName || '').trim();

  if (trimmedFirstName && trimmedLastName) {
    return {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
    };
  }

  return toStudentNameFromEmail(email);
};

const createTwoFactorLoginChallenge = async (
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> => {
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + TWO_FACTOR_LOGIN_CHALLENGE_TTL_MS).toISOString();

  await supabaseAdmin
    .from('two_factor_login_challenges')
    .update({ consumed_at: nowIso })
    .eq('user_id', userId)
    .is('consumed_at', null);

  const { data, error } = await supabaseAdmin
    .from('two_factor_login_challenges')
    .insert({
      user_id: userId,
      expires_at: expiresAtIso,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    logger.error('Failed to create two-factor login challenge', {
      userId,
      error: error?.message,
    });

    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to start two-factor verification. Please try again.',
      500
    );
  }

  return data.id as string;
};

const consumeTwoFactorLoginChallenge = async (
  challengeId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  const { data: challenge, error } = await supabaseAdmin
    .from('two_factor_login_challenges')
    .select('id, user_id, expires_at, consumed_at, ip_address, user_agent')
    .eq('id', challengeId)
    .maybeSingle();

  if (error || !challenge) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session is invalid or expired. Please sign in again.',
      401
    );
  }

  const typedChallenge = challenge as TwoFactorLoginChallenge;
  if (typedChallenge.user_id !== userId) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session is invalid or expired. Please sign in again.',
      401
    );
  }

  if (typedChallenge.consumed_at) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session is invalid or expired. Please sign in again.',
      401
    );
  }

  if (new Date(typedChallenge.expires_at).getTime() < Date.now()) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session has expired. Please sign in again.',
      401
    );
  }

  if (typedChallenge.ip_address && ipAddress && typedChallenge.ip_address !== ipAddress) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session is invalid. Please sign in again.',
      401
    );
  }

  if (typedChallenge.user_agent && userAgent && typedChallenge.user_agent !== userAgent) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session is invalid. Please sign in again.',
      401
    );
  }

  const { error: consumeError } = await supabaseAdmin
    .from('two_factor_login_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', typedChallenge.id)
    .is('consumed_at', null);

  if (consumeError) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Two-factor verification session is invalid or expired. Please sign in again.',
      401
    );
  }
};

/**
 * Public teacher signup request.
 */
export const signup = async (input: SignupInput): Promise<{ message: string }> => {
  const { email, first_name, last_name, role } = input;
  const normalizedEmail = normalizeEmail(email);

  const normalizedFirstName = (first_name || '').trim();
  const normalizedLastName = (last_name || '').trim();

  if (role && role !== UserRole.TEACHER) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Public signup is available for teacher applications only.',
      400
    );
  }

  if (!normalizedFirstName || !normalizedLastName) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'First and last name are required.',
      400
    );
  }

  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, pending_approval')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profileError && !isNotFoundError(profileError)) {
    logger.error('Failed to lookup existing profile for teacher signup', {
      email: normalizedEmail,
      error: profileError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to process signup request right now.',
      500
    );
  }

  if (existingProfile && existingProfile.role !== UserRole.TEACHER) {
    return { message: TEACHER_SIGNUP_GENERIC_MESSAGE };
  }

  if (existingProfile && existingProfile.role === UserRole.TEACHER && existingProfile.pending_approval !== true) {
    return { message: TEACHER_SIGNUP_GENERIC_MESSAGE };
  }

  const verificationToken = generateFlowToken();
  const verificationTokenHash = hashFlowToken(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + TEACHER_SIGNUP_VERIFICATION_TTL_MS).toISOString();

  const { data: existingApplication, error: applicationLookupError } = await supabaseAdmin
    .from('teacher_applications')
    .select('id, email, first_name, last_name, status')
    .eq('email', normalizedEmail)
    .in('status', ['pending_email_verification', 'pending_review', 'approved'])
    .maybeSingle();

  if (applicationLookupError && !isNotFoundError(applicationLookupError)) {
    logger.error('Failed to lookup existing teacher application', {
      email: normalizedEmail,
      error: applicationLookupError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to process signup request right now.',
      500
    );
  }

  if (existingApplication?.status === 'pending_review' || existingApplication?.status === 'approved') {
    return { message: TEACHER_SIGNUP_GENERIC_MESSAGE };
  }

  if (existingApplication?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('teacher_applications')
      .update({
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        status: 'pending_email_verification',
        verification_token_hash: verificationTokenHash,
        verification_expires_at: verificationExpiresAt,
        email_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingApplication.id);

    if (updateError) {
      logger.error('Failed to update teacher application', {
        email: normalizedEmail,
        error: updateError.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Unable to process signup request right now.',
        500
      );
    }
  } else {
    const { error: createError } = await supabaseAdmin
      .from('teacher_applications')
      .insert({
        email: normalizedEmail,
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        status: 'pending_email_verification',
        verification_token_hash: verificationTokenHash,
        verification_expires_at: verificationExpiresAt,
      });

    if (createError) {
      logger.error('Failed to create teacher application', {
        email: normalizedEmail,
        error: createError.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Unable to process signup request right now.',
        500
      );
    }
  }

  const verificationLink = `${emailService.getClientUrl()}/auth/verify-email?token=${verificationToken}&flow=teacher-signup`;

  try {
    await emailService.sendTeacherApplicationVerificationEmail(
      normalizedEmail,
      `${normalizedFirstName} ${normalizedLastName}`,
      verificationLink
    );
  } catch (emailError) {
    logger.error('Teacher signup verification email failed', {
      email: normalizedEmail,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    });
  }

  return {
    message: TEACHER_SIGNUP_GENERIC_MESSAGE,
  };
};

/**
 * Student self-signup request that sends a one-time setup link.
 */
export const requestStudentCredentialSignup = async (
  input: StudentCredentialSignupInput,
  ipAddress?: string,
  userAgent?: string
): Promise<{ message: string; delivery: 'verification_link' }> => {
  const normalizedEmail = normalizeEmail(input.email);

  assertInstitutionalStudentEmail(normalizedEmail, 'Student signup');

  const dayWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await supabaseAdmin
    .from('student_signup_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalizedEmail)
    .gte('created_at', dayWindowStart);

  if (countError) {
    logger.error('Failed counting student signup challenge requests', {
      email: normalizedEmail,
      error: countError.message,
    });
  }

  const { data: latestChallenge, error: latestChallengeError } = await supabaseAdmin
    .from('student_signup_challenges')
    .select('created_at')
    .eq('email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestChallengeError && !isNotFoundError(latestChallengeError)) {
    logger.error('Failed reading latest student signup challenge', {
      email: normalizedEmail,
      error: latestChallengeError.message,
    });
  }

  const latestCreatedAt = latestChallenge?.created_at ? new Date(latestChallenge.created_at).getTime() : 0;
  const isOnCooldown = latestCreatedAt > 0 && Date.now() - latestCreatedAt < STUDENT_SIGNUP_COOLDOWN_MS;
  const exceededDailyCap = (recentCount || 0) >= STUDENT_SIGNUP_DAILY_CAP;

  if (isOnCooldown || exceededDailyCap) {
    return {
      message: STUDENT_SIGNUP_GENERIC_MESSAGE,
      delivery: 'verification_link',
    };
  }

  const challengeToken = generateFlowToken();
  const challengeTokenHash = hashFlowToken(challengeToken);
  const challengeExpiresAt = new Date(Date.now() + STUDENT_SIGNUP_CHALLENGE_TTL_MS).toISOString();

  const { error: insertError } = await supabaseAdmin
    .from('student_signup_challenges')
    .insert({
      email: normalizedEmail,
      token_hash: challengeTokenHash,
      expires_at: challengeExpiresAt,
      request_ip: ipAddress || null,
      request_user_agent: userAgent || null,
    });

  if (insertError) {
    logger.error('Failed to create student signup challenge', {
      email: normalizedEmail,
      error: insertError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to process signup request right now.',
      500
    );
  }

  const accountSetupLink = `${emailService.getClientUrl()}/auth/reset-password?token=${challengeToken}&flow=student-signup`;

  try {
    await emailService.sendStudentSignupVerificationEmail(normalizedEmail, accountSetupLink);
  } catch (emailError) {
    logger.error('Failed to send student signup verification email', {
      email: normalizedEmail,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    });
  }

  return {
    message: STUDENT_SIGNUP_GENERIC_MESSAGE,
    delivery: 'verification_link',
  };
};

export const completeStudentSignup = async (
  input: StudentSignupCompleteInput,
  ipAddress?: string,
  userAgent?: string
): Promise<{ message: string }> => {
  const tokenHash = hashFlowToken(input.token);

  const { data: challenge, error: challengeError } = await supabaseAdmin
    .from('student_signup_challenges')
    .select('id, email, token_hash, expires_at, used_at, created_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (challengeError && !isNotFoundError(challengeError)) {
    logger.error('Failed to lookup student signup challenge', {
      error: challengeError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to complete account setup.',
      500
    );
  }

  if (!challenge) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired signup link.',
      401
    );
  }

  const typedChallenge = challenge as StudentSignupChallenge;

  if (typedChallenge.used_at) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'This signup link has already been used.',
      409
    );
  }

  if (new Date(typedChallenge.expires_at).getTime() < Date.now()) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Signup link has expired. Please request a new one.',
      401
    );
  }

  const normalizedEmail = normalizeEmail(typedChallenge.email);
  const resolvedName = getNormalizedName(input.first_name, input.last_name, normalizedEmail);

  const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, first_name, last_name')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profileLookupError && !isNotFoundError(profileLookupError)) {
    logger.error('Failed to lookup profile for student signup completion', {
      email: normalizedEmail,
      error: profileLookupError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to complete account setup.',
      500
    );
  }

  let userId = existingProfile?.id || '';

  if (existingProfile) {
    if (existingProfile.role !== UserRole.STUDENT) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'This signup link cannot be used for this account.',
        403
      );
    }

    const firstName = (existingProfile.first_name || resolvedName.firstName).trim();
    const lastName = (existingProfile.last_name || resolvedName.lastName).trim();

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: UserRole.STUDENT,
      },
    });

    if (authUpdateError) {
      logger.error('Failed to update student credentials during signup completion', {
        userId,
        email: normalizedEmail,
        error: authUpdateError.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Unable to complete account setup.',
        500
      );
    }
  } else {
    const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: resolvedName.firstName,
        last_name: resolvedName.lastName,
        role: UserRole.STUDENT,
      },
    });

    if (authCreateError || !authData.user) {
      logger.error('Failed to create student account from signup challenge', {
        email: normalizedEmail,
        error: authCreateError?.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Unable to complete account setup.',
        500
      );
    }

    userId = authData.user.id;
  }

  const { error: upsertProfileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      email: normalizedEmail,
      first_name: resolvedName.firstName,
      last_name: resolvedName.lastName,
      role: UserRole.STUDENT,
      pending_approval: false,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (upsertProfileError) {
    logger.error('Failed to upsert student profile after signup completion', {
      userId,
      email: normalizedEmail,
      error: upsertProfileError.message,
    });
  }

  const { error: markUsedError } = await supabaseAdmin
    .from('student_signup_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('id', typedChallenge.id)
    .is('used_at', null);

  if (markUsedError) {
    logger.warn('Failed to mark student signup challenge as used', {
      challengeId: typedChallenge.id,
      error: markUsedError.message,
    });
  }

  await clearTemporaryPasswordRequirement(userId);

  await auditService.logAuthEvent(
    userId,
    AuditEventType.ACCOUNT_CREATED,
    ipAddress,
    userAgent,
    {
      source: 'student_signup_challenge',
      email: normalizedEmail,
    }
  );

  return {
    message: STUDENT_SIGNUP_COMPLETE_MESSAGE,
  };
};

export const verifyTeacherSignup = async (token: string): Promise<{ message: string }> => {
  const tokenHash = hashFlowToken(token);

  const { data: application, error: applicationError } = await supabaseAdmin
    .from('teacher_applications')
    .select('id, email, first_name, last_name, status, verification_token_hash, verification_expires_at')
    .eq('verification_token_hash', tokenHash)
    .maybeSingle();

  if (applicationError && !isNotFoundError(applicationError)) {
    logger.error('Failed to lookup teacher verification token', {
      error: applicationError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to verify application at this time.',
      500
    );
  }

  if (!application) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired verification link.',
      401
    );
  }

  const typedApplication = application as TeacherApplication;

  if (typedApplication.status !== 'pending_email_verification') {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'This verification link has already been used.',
      409
    );
  }

  const verificationExpiresAtMs = typedApplication.verification_expires_at
    ? new Date(typedApplication.verification_expires_at).getTime()
    : 0;

  if (!verificationExpiresAtMs || verificationExpiresAtMs < Date.now()) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Verification link has expired. Please submit a new signup request.',
      401
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from('teacher_applications')
    .update({
      status: 'pending_review',
      email_verified_at: new Date().toISOString(),
      verification_token_hash: null,
      verification_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', typedApplication.id);

  if (updateError) {
    logger.error('Failed to mark teacher application as verified', {
      applicationId: typedApplication.id,
      error: updateError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to verify application at this time.',
      500
    );
  }

  try {
    const pendingCount = await getPendingTeachersCount();
    notifyAdminsPendingTeacher({
      id: typedApplication.id,
      name: `${typedApplication.first_name} ${typedApplication.last_name}`,
      email: typedApplication.email,
      pendingCount,
    });
  } catch (notificationError) {
    logger.error('Failed to notify admins after teacher verification', {
      applicationId: typedApplication.id,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    });
  }

  return {
    message: TEACHER_SIGNUP_VERIFIED_MESSAGE,
  };
};

export const completeTeacherOnboarding = async (
  input: TeacherOnboardingCompleteInput,
  ipAddress?: string,
  userAgent?: string
): Promise<{ message: string }> => {
  const tokenHash = hashFlowToken(input.token);

  const { data: application, error: applicationError } = await supabaseAdmin
    .from('teacher_applications')
    .select(
      'id, email, first_name, last_name, status, linked_user_id, onboarding_token_hash, onboarding_expires_at, onboarding_used_at'
    )
    .eq('onboarding_token_hash', tokenHash)
    .maybeSingle();

  if (applicationError && !isNotFoundError(applicationError)) {
    logger.error('Failed to lookup teacher onboarding token', {
      error: applicationError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to complete onboarding at this time.',
      500
    );
  }

  if (!application) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired onboarding link.',
      401
    );
  }

  const typedApplication = application as TeacherApplication;

  if (typedApplication.status !== 'approved' || !typedApplication.linked_user_id) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'This onboarding link is no longer valid.',
      403
    );
  }

  if (typedApplication.onboarding_used_at) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'This onboarding link has already been used.',
      409
    );
  }

  const onboardingExpiresAtMs = typedApplication.onboarding_expires_at
    ? new Date(typedApplication.onboarding_expires_at).getTime()
    : 0;

  if (!onboardingExpiresAtMs || onboardingExpiresAtMs < Date.now()) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Onboarding link has expired. Please contact your administrator.',
      401
    );
  }

  const userId = typedApplication.linked_user_id;
  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: typedApplication.first_name,
      last_name: typedApplication.last_name,
      role: UserRole.TEACHER,
    },
  });

  if (updateAuthError) {
    logger.error('Failed to set teacher onboarding password', {
      userId,
      applicationId: typedApplication.id,
      error: updateAuthError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Unable to complete onboarding at this time.',
      500
    );
  }

  const { error: profileUpsertError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      email: normalizeEmail(typedApplication.email),
      first_name: typedApplication.first_name,
      last_name: typedApplication.last_name,
      role: UserRole.TEACHER,
      pending_approval: false,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (profileUpsertError) {
    logger.error('Failed to upsert teacher profile during onboarding completion', {
      userId,
      applicationId: typedApplication.id,
      error: profileUpsertError.message,
    });
  }

  const { error: markOnboardingUsedError } = await supabaseAdmin
    .from('teacher_applications')
    .update({
      onboarding_used_at: new Date().toISOString(),
      onboarding_token_hash: null,
      onboarding_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', typedApplication.id);

  if (markOnboardingUsedError) {
    logger.warn('Failed to mark teacher onboarding link as used', {
      applicationId: typedApplication.id,
      error: markOnboardingUsedError.message,
    });
  }

  await clearTemporaryPasswordRequirement(userId);

  await auditService.logAuthEvent(
    userId,
    AuditEventType.ACCOUNT_CREATED,
    ipAddress,
    userAgent,
    {
      source: 'teacher_onboarding_completed',
      email: normalizeEmail(typedApplication.email),
      application_id: typedApplication.id,
    }
  );

  return {
    message: TEACHER_ONBOARDING_COMPLETE_MESSAGE,
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
  const {
    email,
    password,
    twoFactorCode,
    twoFactorChallengeId,
    portal = 'app',
    remember_me = true,
    roleIntent,
  } = input;
  const normalizedEmail = normalizeEmail(email);
  const authClient = createIsolatedAuthClient();

  const { data, error } = await authClient.auth.signInWithPassword({
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

  if (
    portal === 'app' &&
    roleIntent === UserRole.TEACHER &&
    profile.role !== UserRole.TEACHER
  ) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      {
        reason: 'teacher_portal_requires_teacher_role',
        role: profile.role,
        role_intent: roleIntent,
        email: profile.email,
      }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Teacher login requires a teacher account.',
      403
    );
  }

  if (
    portal === 'app' &&
    roleIntent === UserRole.STUDENT &&
    profile.role !== UserRole.STUDENT
  ) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      {
        reason: 'student_portal_requires_student_role',
        role: profile.role,
        role_intent: roleIntent,
        email: profile.email,
      }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Student login requires a student account.',
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

  if (profile.email_verified !== true && profile.role !== UserRole.ADMIN) {
    await auditService.logAuthEvent(
      data.user.id,
      AuditEventType.LOGIN_FAILED,
      ipAddress,
      userAgent,
      { reason: 'email_not_verified', email: profile.email }
    );

    await supabaseAdmin.auth.admin.signOut(data.user.id);

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Please verify your email before signing in.',
      403
    );
  }

  // Check if 2FA is enabled
  const has2FA = await twoFactorService.isTwoFactorEnabled(data.user.id);
  
  if (has2FA) {
    // If 2FA is enabled but no code provided, return requires2FA flag
    if (!twoFactorCode) {
      const challengeId = await createTwoFactorLoginChallenge(data.user.id, ipAddress, userAgent);
      // Sign out the session immediately (don't grant access yet)
      await supabaseAdmin.auth.admin.signOut(data.user.id);
      
      return {
        user: profile,
        session: {
          access_token: '',
          refresh_token: '',
          expires_in: 0,
          token_type: 'bearer',
        },
        requires2FA: true,
        twoFactorChallengeId: challengeId,
      };
    }

    if (!twoFactorChallengeId) {
      await supabaseAdmin.auth.admin.signOut(data.user.id);
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Two-factor verification session expired. Please sign in again.',
        401
      );
    }

    await consumeTwoFactorLoginChallenge(
      twoFactorChallengeId,
      data.user.id,
      ipAddress,
      userAgent
    );
    
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
      await supabaseAdmin.auth.admin.signOut(data.user.id);
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
    {
      ...createSessionProofDeviceInfo(data.session.access_token),
      remember_me,
      portal,
      role_intent: roleIntent || null,
    }
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
  const authClient = createIsolatedAuthClient();

  const { data, error } = await authClient.auth.refreshSession({
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
  await clearTemporaryPasswordRequirement(user.id);
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
  const authClient = createIsolatedAuthClient();
  const { error: verifyError } = await authClient.auth.signInWithPassword({
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

  const { error: verificationSignOutError } = await authClient.auth.signOut();
  if (verificationSignOutError) {
    logger.warn('Failed to clear password verification auth session', {
      userId,
      error: verificationSignOutError.message,
    });
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
  await clearTemporaryPasswordRequirement(userId);
  
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
