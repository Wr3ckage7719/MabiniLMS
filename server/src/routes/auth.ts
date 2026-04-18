import { Router } from 'express';
import * as authController from '../controllers/auth.js';
import * as emailVerificationController from '../controllers/email-verification.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  signupLimiter,
  studentSignupLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  verificationEmailLimiter,
} from '../middleware/rateLimiter.js';
import { verifyBotChallenge } from '../middleware/botProtection.js';
import {
  signupSchema,
  studentCredentialSignupSchema,
  studentSignupCompleteSchema,
  teacherOnboardingCompleteSchema,
  completeGoogleStudentOnboardingSchema,
  teacherSignupVerificationSchema,
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
  signupLimiter,
  verifyBotChallenge,
  validate({ body: signupSchema }),
  authController.signup
);

router.get(
  '/signup/teacher/verify',
  verificationEmailLimiter,
  validate({ query: teacherSignupVerificationSchema }),
  authController.verifyTeacherSignup
);

router.post(
  '/student-signup',
  studentSignupLimiter,
  verifyBotChallenge,
  validate({ body: studentCredentialSignupSchema }),
  authController.studentSignup
);

router.post(
  '/student-signup/complete',
  studentSignupLimiter,
  verifyBotChallenge,
  validate({ body: studentSignupCompleteSchema }),
  authController.completeStudentSignup
);

router.post(
  '/teacher-onboarding/complete',
  signupLimiter,
  verifyBotChallenge,
  validate({ body: teacherOnboardingCompleteSchema }),
  authController.completeTeacherOnboarding
);

router.post(
  '/login',
  loginLimiter,
  verifyBotChallenge,
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
  forgotPasswordLimiter,
  verifyBotChallenge,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  forgotPasswordLimiter,
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
  loginLimiter,
  authController.changePassword
);

router.post(
  '/google-student-onboarding/complete',
  authenticate,
  loginLimiter,
  validate({ body: completeGoogleStudentOnboardingSchema }),
  authController.completeGoogleStudentOnboarding
);

// Email verification routes
router.get(
  '/verify-email',
  verificationEmailLimiter,
  validate({ query: verifyEmailSchema }),
  emailVerificationController.verifyEmail
);

router.post(
  '/resend-verification',
  verificationEmailLimiter,
  verifyBotChallenge,
  validate({ body: resendVerificationSchema }),
  emailVerificationController.resendVerificationEmail
);

router.post(
  '/send-password-reset',
  forgotPasswordLimiter,
  verifyBotChallenge,
  validate({ body: sendPasswordResetSchema }),
  emailVerificationController.forgotPassword
);

router.post(
  '/reset-password-token',
  forgotPasswordLimiter,
  validate({ body: resetPasswordEmailSchema }),
  emailVerificationController.resetPassword
);

export default router;
