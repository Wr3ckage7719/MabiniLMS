import { Request, Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse } from '../types/index.js';
import {
  SignupInput,
  StudentCredentialSignupInput,
  StudentSignupCompleteInput,
  TeacherOnboardingCompleteInput,
  CompleteGoogleStudentOnboardingInput,
  LoginInput,
  RefreshTokenInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  AuthResponse,
  AuthSession,
} from '../types/auth.js';
import * as authService from '../services/auth.js';

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account with email and password
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - first_name
 *               - last_name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, teacher, student]
 *                 default: student
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: User already exists
 */
export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: SignupInput = req.body;
    const result = await authService.signup(input);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: result,
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/student-signup:
 *   post:
 *     summary: Request student account credentials via email
 *     description: Creates or resets a student account using institutional email and sends temporary credentials by email
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Credentials request processed
 */
export const studentSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: StudentCredentialSignupInput = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await authService.requestStudentCredentialSignup(input, ipAddress, userAgent);

    const response: ApiResponse = {
      success: true,
      data: {
        message: result.message,
        delivery: result.delivery,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const completeStudentSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: StudentSignupCompleteInput = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await authService.completeStudentSignup(input, ipAddress, userAgent);

    const response: ApiResponse = {
      success: true,
      data: {
        message: result.message,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const verifyTeacherSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = String(req.query.token || '');
    const result = await authService.verifyTeacherSignup(token);

    const response: ApiResponse = {
      success: true,
      data: {
        message: result.message,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const completeTeacherOnboarding = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: TeacherOnboardingCompleteInput = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await authService.completeTeacherOnboarding(input, ipAddress, userAgent);

    const response: ApiResponse = {
      success: true,
      data: {
        message: result.message,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const completeGoogleStudentOnboarding = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const input: CompleteGoogleStudentOnboardingInput = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await authService.completeGoogleStudentOnboarding(
      userId,
      input,
      ipAddress,
      userAgent
    );

    const response: ApiResponse = {
      success: true,
      data: {
        message: result.message,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticate user with email and password
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               remember_me:
 *                 type: boolean
 *                 default: true
 *                 description: Persist session across browser/device restarts when true
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: LoginInput = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    const result = await authService.login(input, ipAddress, userAgent);

    const response: ApiResponse<AuthResponse> = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Invalidate user session
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    await authService.logout(userId, ipAddress, userAgent);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Logged out successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Get new access token using refresh token
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: RefreshTokenInput = req.body;
    const result = await authService.refreshToken(input);

    const response: ApiResponse<AuthSession> = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Send password reset email to user
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent (if account exists)
 */
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email }: ForgotPasswordInput = req.body;
    await authService.forgotPassword(email);

    // Always return success to prevent email enumeration
    const response: ApiResponse = {
      success: true,
      data: { message: 'If an account exists with this email, a reset link has been sent' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Reset password using token from email
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { password }: ResetPasswordInput = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';

    await authService.resetPassword(token, password);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Password reset successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Get authenticated user's profile
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const getCurrentUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const profile = await authService.getCurrentUserProfile(userId);

    const response: ApiResponse = {
      success: true,
      data: profile,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     summary: Change password
 *     description: Change password for authenticated user (invalidates other sessions)
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Current password incorrect
 */
export const changePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({
        success: false,
        error: { message: 'Current password and new password are required' },
      });
      return;
    }

    if (new_password.length < 8) {
      res.status(400).json({
        success: false,
        error: { message: 'New password must be at least 8 characters' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    await authService.changePassword(userId, current_password, new_password, ipAddress, userAgent);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Password changed successfully. Other sessions have been invalidated.' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
