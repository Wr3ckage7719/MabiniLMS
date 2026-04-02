import { Response, NextFunction } from 'express';
import { AuthRequest, ApiError, ErrorCode, UserRole } from '../types/index.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../utils/logger.js';

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

    // Fetch user profile to get role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, email, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
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
