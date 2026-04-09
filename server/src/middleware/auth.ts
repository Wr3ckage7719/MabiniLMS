import { Response, NextFunction } from 'express';
import { AuthRequest, ApiError, ErrorCode, UserRole } from '../types/index.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { ALLOWED_DOMAIN } from '../types/google-oauth.js';
import logger from '../utils/logger.js';

// Cache for session timeout setting (refreshed every 5 minutes)
let cachedSessionTimeout: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const STUDENT_INSTITUTIONAL_DOMAIN = ALLOWED_DOMAIN.toLowerCase();

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const resolveUserRole = (roleValue: unknown): UserRole => {
  if (roleValue === UserRole.ADMIN || roleValue === UserRole.TEACHER || roleValue === UserRole.STUDENT) {
    return roleValue;
  }
  return UserRole.STUDENT;
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

    // Fetch user profile to get role and approval status
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, email, first_name, last_name, pending_approval, password_changed_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      logger.error('Profile fetch failed', { 
        userId: user.id, 
        error: profileError?.message 
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

      const { data: bootstrapProfile, error: bootstrapError } = await supabaseAdmin
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
        )
        .select('role, email, first_name, last_name, pending_approval, password_changed_at')
        .single();

      if (bootstrapError || !bootstrapProfile) {
        logger.error('Profile bootstrap failed', {
          userId: user.id,
          email: normalizedEmail,
          error: bootstrapError?.message,
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
