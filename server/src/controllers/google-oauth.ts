import { Request, Response, NextFunction } from 'express';
import * as googleOAuthService from '../services/google-oauth.js';
import { ALLOWED_DOMAIN } from '../types/google-oauth.js';

/**
 * @swagger
 * tags:
 *   name: Google OAuth
 *   description: Google OAuth authentication endpoints
 */

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth flow
 *     tags: [Google OAuth]
 *     description: Redirects to Google OAuth consent screen. Only @mabinicolleges.edu.ph emails are allowed.
 *     responses:
 *       302:
 *         description: Redirects to Google OAuth consent screen
 */
export const initiateGoogleOAuth = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authUrl = googleOAuthService.getGoogleOAuthUrl(true);
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/google/url:
 *   get:
 *     summary: Get Google OAuth URL (for SPA)
 *     tags: [Google OAuth]
 *     description: Returns the Google OAuth URL instead of redirecting. Useful for SPAs.
 *     responses:
 *       200:
 *         description: OAuth URL returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     allowed_domain:
 *                       type: string
 */
export const getGoogleOAuthUrl = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authUrl = googleOAuthService.getGoogleOAuthUrl(true);
    
    res.json({
      success: true,
      data: {
        url: authUrl,
        allowed_domain: ALLOWED_DOMAIN,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Google OAuth]
 *     description: Handles the OAuth callback from Google. Creates user if new, returns session tokens.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: Error from Google (if any)
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/UserProfile'
 *                     session:
 *                       type: object
 *                     google_tokens:
 *                       type: object
 *       403:
 *         description: Non-institutional email
 */
export const handleGoogleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, error: googleError } = req.query;

    if (googleError) {
      // User denied access or other error
      res.status(400).json({
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: `Google authentication failed: ${googleError}`,
        },
      });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required',
        },
      });
      return;
    }

    const session = await googleOAuthService.handleGoogleCallback(code);

    // For SPA: Return JSON response
    // For traditional web: Could redirect with token in URL fragment
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const redirectUrl = `${clientUrl}/auth/callback?token=${session.session.access_token}`;

    // Check if request wants JSON or redirect
    if (req.accepts('json')) {
      res.json({
        success: true,
        data: session,
      });
    } else {
      // Redirect to frontend with token
      res.redirect(redirectUrl);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/google/refresh:
 *   post:
 *     summary: Refresh Google access token
 *     tags: [Google OAuth]
 *     security:
 *       - bearerAuth: []
 *     description: Refreshes the Google access token for Drive operations
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Refresh token invalid or missing
 */
export const refreshGoogleToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // User ID should be extracted from auth middleware
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const tokens = await googleOAuthService.refreshGoogleToken(userId);

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/google/revoke:
 *   post:
 *     summary: Revoke Google tokens
 *     tags: [Google OAuth]
 *     security:
 *       - bearerAuth: []
 *     description: Revokes Google OAuth tokens and disconnects Drive access
 *     responses:
 *       200:
 *         description: Tokens revoked
 */
export const revokeGoogleTokens = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    await googleOAuthService.revokeGoogleTokens(userId);

    res.json({
      success: true,
      data: { message: 'Google tokens revoked successfully' },
    });
  } catch (error) {
    next(error);
  }
};
