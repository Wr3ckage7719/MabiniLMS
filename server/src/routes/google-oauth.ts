import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { googleOAuthLimiter } from '../middleware/rateLimiter.js';
import * as googleOAuthController from '../controllers/google-oauth.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Google OAuth
 *   description: Google OAuth SSO authentication for institutional accounts
 */

// GET /api/auth/google - Initiate OAuth (redirect to Google)
router.get('/', googleOAuthLimiter, googleOAuthController.initiateGoogleOAuth);

// GET /api/auth/google/url - Get OAuth URL (for SPA)
router.get('/url', googleOAuthLimiter, googleOAuthController.getGoogleOAuthUrl);

// GET /api/auth/google/callback - OAuth callback handler
router.get('/callback', googleOAuthLimiter, googleOAuthController.handleGoogleCallback);

// POST /api/auth/google/refresh - Refresh Google token (requires auth)
router.post('/refresh', authenticate, googleOAuthController.refreshGoogleToken);

// POST /api/auth/google/revoke - Revoke Google tokens (requires auth)
router.post('/revoke', authenticate, googleOAuthController.revokeGoogleTokens);

export default router;
