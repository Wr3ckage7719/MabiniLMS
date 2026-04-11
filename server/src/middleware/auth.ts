import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, ApiError, ErrorCode, UserRole } from '../types/index.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { ALLOWED_DOMAIN } from '../types/google-oauth.js';
import logger from '../utils/logger.js';

// Cache for session timeout setting (refreshed every 5 minutes)
let cachedSessionTimeout: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const STUDENT_INSTITUTIONAL_DOMAIN = ALLOWED_DOMAIN.toLowerCase();
const PROFILE_SELECT_WITH_SECURITY_TRACKING =
  'role, email, first_name, last_name, pending_approval, password_changed_at, two_factor_enabled';
const PROFILE_SELECT_WITH_PASSWORD_TRACKING =
  'role, email, first_name, last_name, pending_approval, password_changed_at';
const PROFILE_SELECT_LEGACY =
  'role, email, first_name, last_name, pending_approval';

type AuthProfile = {
  role: UserRole | string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  pending_approval: boolean | null;
  password_changed_at: string | null;
  two_factor_enabled: boolean | null;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const resolveUserRole = (roleValue: unknown): UserRole => {
  if (roleValue === UserRole.ADMIN || roleValue === UserRole.TEACHER || roleValue === UserRole.STUDENT) {
    return roleValue;
  }
  return UserRole.STUDENT;
};

const isMissingColumnError = (message: string | undefined, columnName: string): boolean => {
  const normalizedMessage = (message || '').toLowerCase();
  return (
    normalizedMessage.includes(columnName.toLowerCase()) &&
    normalizedMessage.includes('column')
  );
};

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

const hasServerSessionProof = async (userId: string, accessToken: string): Promise<boolean> => {
  const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
  const sessionId = getTokenSessionId(accessToken);

  let query = supabaseAdmin
    .from('session_logs')
    .select('id')
    .eq('user_id', userId)
    .in('event_type', ['login', 'token_refresh'])
    .order('created_at', { ascending: false })
    .limit(1);

  query = sessionId
    ? query.contains('device_info', { session_id: sessionId })
    : query.contains('device_info', { token_hash: tokenHash });

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to validate server session proof', {
      userId,
      sessionId,
      error: error.message,
    });
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};

const isTwoFactorEnabledForUser = async (
  userId: string,
  profileFlag: boolean | null
): Promise<boolean> => {
  if (profileFlag === true) {
    return true;
  }

  const { data, error } = await supabaseAdmin
    .from('two_factor_auth')
    .select('is_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('Unable to verify two-factor status from table', {
      userId,
      error: error.message,
    });
    return false;
  }

  return data?.is_enabled === true;
};

const fetchAuthProfile = async (
  userId: string
): Promise<{ profile: AuthProfile | null; errorMessage?: string }> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT_WITH_SECURITY_TRACKING)
    .eq('id', userId)
    .maybeSingle();

  if (!error) {
    return { profile: data as AuthProfile | null };
  }

  const isMissingTwoFactorEnabled = isMissingColumnError(error.message, 'two_factor_enabled');
  const isMissingPasswordChangedAt = isMissingColumnError(error.message, 'password_changed_at');

  if (!isMissingTwoFactorEnabled && !isMissingPasswordChangedAt) {
    return { profile: null, errorMessage: error.message };
  }

  if (isMissingTwoFactorEnabled) {
    const { data: dataWithoutTwoFactor, error: fallbackError } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_SELECT_WITH_PASSWORD_TRACKING)
      .eq('id', userId)
      .maybeSingle();

    if (!fallbackError) {
      const fallbackProfile = dataWithoutTwoFactor
        ? ({
            ...dataWithoutTwoFactor,
            two_factor_enabled: false,
          } as AuthProfile)
        : null;

      return { profile: fallbackProfile };
    }

    if (!isMissingColumnError(fallbackError.message, 'password_changed_at')) {
      return { profile: null, errorMessage: fallbackError.message };
    }
  }

  // Backward compatibility for environments that have not applied migration 005/007 yet.
  const { data: legacyData, error: legacyError } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT_LEGACY)
    .eq('id', userId)
    .maybeSingle();

  if (legacyError) {
    return { profile: null, errorMessage: legacyError.message };
  }

  const legacyProfile = legacyData
    ? ({
        ...legacyData,
        password_changed_at: null,
        two_factor_enabled: false,
      } as AuthProfile)
    : null;

  return { profile: legacyProfile };
};

/**
 * Get session timeout from system settings (with caching)
 * Default: 480 minutes (8 hours)
 */
const getSessionTimeoutMinutes = async (): Promise<number> => {
  const now = Date.now();
  
  // Return cached value if still valid
  if (cachedSessionTimeout !== null && now - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedSessionTimeout;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'session_timeout_minutes')
      .single();

    if (!error && data?.value) {
      cachedSessionTimeout = typeof data.value === 'number' ? data.value : 480;
    } else {
      cachedSessionTimeout = 480; // Default 8 hours
    }
    cacheTimestamp = now;
    return cachedSessionTimeout;
  } catch {
    return 480; // Default on error
  }
};

/**
 * Check if session has timed out based on token issued time
 */
const isSessionTimedOut = (tokenIssuedAt: number | undefined, timeoutMinutes: number): boolean => {
  if (!tokenIssuedAt) return false;
  
  const issuedAtMs = tokenIssuedAt * 1000; // Convert to milliseconds
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const expiresAt = issuedAtMs + timeoutMs;
  
  return Date.now() > expiresAt;
};

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Missing or invalid authorization header',
        401
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.error('Authentication failed', { error: error?.message });
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid or expired token',
        401
      );
    }

    // Check session timeout based on last sign-in time
    const sessionTimeout = await getSessionTimeoutMinutes();
    const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() / 1000 : undefined;
    
    if (lastSignInAt && isSessionTimedOut(lastSignInAt, sessionTimeout)) {
      logger.warn('Session timed out', {
        userId: user.id,
        lastSignIn: user.last_sign_in_at,
        timeoutMinutes: sessionTimeout
      });
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Session has expired. Please sign in again.',
        401
      );
    }

    // Fetch user profile to get role and approval status.
    const { profile: existingProfile, errorMessage: profileErrorMessage } = await fetchAuthProfile(user.id);

    if (profileErrorMessage) {
      logger.error('Profile fetch failed', { 
        userId: user.id, 
        error: profileErrorMessage,
      });
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'User profile not found',
        401
      );
    }

    let profile = existingProfile;

    // Backfill a missing profile so API does not hard-fail for valid auth users.
    if (!profile) {
      const rawRole = user.user_metadata?.role || user.app_metadata?.role;
      const role = resolveUserRole(rawRole);
      const normalizedEmail = normalizeEmail(user.email || '');

      const fullName = (user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
      const nameParts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];
      const firstName = user.user_metadata?.first_name || nameParts[0] || null;
      const lastName = user.user_metadata?.last_name || nameParts.slice(1).join(' ') || null;

      const { error: bootstrapError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email: normalizedEmail,
            first_name: firstName,
            last_name: lastName,
            role,
            email_verified: Boolean(user.email_confirmed_at),
            email_verified_at: user.email_confirmed_at || null,
            pending_approval: role === UserRole.TEACHER,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (bootstrapError) {
        logger.error('Profile bootstrap failed', {
          userId: user.id,
          email: normalizedEmail,
          error: bootstrapError.message,
        });
        throw new ApiError(
          ErrorCode.UNAUTHORIZED,
          'User profile not found',
          401
        );
      }

      const {
        profile: bootstrapProfile,
        errorMessage: bootstrapProfileErrorMessage,
      } = await fetchAuthProfile(user.id);

      if (bootstrapProfileErrorMessage || !bootstrapProfile) {
        logger.error('Profile bootstrap failed', {
          userId: user.id,
          email: normalizedEmail,
          error: bootstrapProfileErrorMessage,
        });
        throw new ApiError(
          ErrorCode.UNAUTHORIZED,
          'User profile not found',
          401
        );
      }

      profile = bootstrapProfile;
    }

    if (!profile) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'User profile not found',
        401
      );
    }

    // Enforce institutional domain for students at API boundary, regardless of login method.
    if (profile.role === UserRole.STUDENT) {
      const profileEmail = normalizeEmail(profile.email || user.email || '');
      if (!profileEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)) {
        logger.warn('Access denied - non-institutional student email', {
          userId: user.id,
          email: profileEmail,
        });
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          `Student login requires an institutional email (@${STUDENT_INSTITUTIONAL_DOMAIN}).`,
          403
        );
      }
    }

    // Check if password was changed after token was issued (force re-login)
    if (profile.password_changed_at && lastSignInAt) {
      const passwordChangedAtMs = new Date(profile.password_changed_at).getTime();
      const lastSignInAtMs = lastSignInAt * 1000;
      
      if (passwordChangedAtMs > lastSignInAtMs) {
        logger.info('Session invalidated due to password change', {
          userId: user.id,
          passwordChangedAt: profile.password_changed_at
        });
        throw new ApiError(
          ErrorCode.UNAUTHORIZED,
          'Your password was changed. Please sign in again.',
          401
        );
      }
    }

    // Check if teacher account is pending approval
    if (profile.role === UserRole.TEACHER && profile.pending_approval === true) {
      logger.warn('Access denied - teacher account pending approval', {
        userId: user.id,
        email: profile.email
      });
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Your teacher account is pending admin approval. You will receive an email once your account is verified.',
        403
      );
    }

    const isTwoFactorEnabled = await isTwoFactorEnabledForUser(user.id, profile.two_factor_enabled);

    if (isTwoFactorEnabled) {
      const hasSessionProof = await hasServerSessionProof(user.id, token);

      if (!hasSessionProof) {
        logger.warn('Access denied - missing server session proof for 2FA user', {
          userId: user.id,
          sessionId: getTokenSessionId(token),
        });

        throw new ApiError(
          ErrorCode.UNAUTHORIZED,
          'This session is not authorized for a two-factor protected account. Please sign in with email and your authenticator code.',
          401
        );
      }
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: profile.email,
      role: profile.role as UserRole,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Authentication failed',
        401
      ));
    }
  }
};

// Authorization middleware - check user role
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(
        ErrorCode.UNAUTHORIZED,
        'User not authenticated',
        401
      ));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.error('Authorization failed', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
      });
      
      return next(new ApiError(
        ErrorCode.FORBIDDEN,
        'Insufficient permissions',
        403
      ));
    }

    next();
  };
};
