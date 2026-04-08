import { Router } from 'express';
import * as authController from '../controllers/auth.js';
import * as emailVerificationController from '../controllers/email-verification.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../types/auth.js';
import {
  verifyEmailSchema,
  resendVerificationSchema,
  sendPasswordResetSchema,
  resetPasswordSchema as resetPasswordEmailSchema,
} from '../types/email.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Authentication
 *     description: User authentication and session management
 */

// Public routes with strict rate limiting
router.post(
  '/signup',
  authLimiter,
  validate({ body: signupSchema }),
  authController.signup
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.post(
  '/refresh',
  validate({ body: refreshTokenSchema }),
  authController.refreshToken
);

router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  authController.resetPassword
);

// Protected routes
router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.get(
  '/me',
  authenticate,
  authController.getCurrentUser
);

router.post(
  '/change-password',
  authenticate,
  authLimiter,
  authController.changePassword
);

// Email verification routes
router.get(
  '/verify-email',
  validate({ query: verifyEmailSchema }),
  emailVerificationController.verifyEmail
);

router.post(
  '/resend-verification',
  authLimiter,
  validate({ body: resendVerificationSchema }),
  emailVerificationController.resendVerificationEmail
);

router.post(
  '/send-password-reset',
  authLimiter,
  validate({ body: sendPasswordResetSchema }),
  emailVerificationController.forgotPassword
);

router.post(
  '/reset-password-token',
  validate({ body: resetPasswordEmailSchema }),
  emailVerificationController.resetPassword
);

export default router;
