// filepath: d:\MabiniLMS\server\src\controllers\twoFactor.ts
import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as twoFactorService from '../services/twoFactor';
import { AuthRequest, ApiResponse } from '../types/index';

// ==========================================
// Validation Schemas
// ==========================================

const verifySchema = z.object({
  token: z.string().length(6).regex(/^\d{6}$/),
});

const disableSchema = z.object({
  token: z.string().min(6),
});

const regenerateSchema = z.object({
  token: z.string().length(6).regex(/^\d{6}$/),
});

// ==========================================
// Controller Functions
// ==========================================

/**
 * @openapi
 * /api/2fa/setup:
 *   post:
 *     summary: Setup 2FA for authenticated user
 *     description: Generate QR code and backup codes for 2FA setup
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup data
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
 *                     qrCode:
 *                       type: string
 *                       description: Base64 QR code image
 *                     backupCodes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: One-time backup codes (save these!)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const setup2FA = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const email = req.user!.email;

    const result = await twoFactorService.generateSecret(userId, email);

    const response: ApiResponse = {
      success: true,
      data: {
        qrCode: result.qrCode,
        backupCodes: result.backupCodes,
      },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/2fa/verify:
 *   post:
 *     summary: Verify and enable 2FA
 *     description: Verify TOTP code to enable 2FA
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP code from authenticator app
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *       400:
 *         description: Invalid verification code
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const verify2FA = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = verifySchema.parse(req.body);
    const userId = req.user!.id;

    await twoFactorService.enableTwoFactor(userId, token);

    const response: ApiResponse = {
      success: true,
      data: { message: '2FA enabled successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     description: Disable two-factor authentication for user
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Current TOTP code or backup code
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 *       400:
 *         description: Invalid verification code
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const disable2FA = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = disableSchema.parse(req.body);
    const userId = req.user!.id;

    await twoFactorService.disableTwoFactor(userId, token);

    const response: ApiResponse = {
      success: true,
      data: { message: '2FA disabled successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/2fa/status:
 *   get:
 *     summary: Get 2FA status
 *     description: Check if 2FA is enabled for current user
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
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
 *                     enabled:
 *                       type: boolean
 *                     enabledAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     backupCodesRemaining:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const get2FAStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const status = await twoFactorService.getTwoFactorStatus(userId);

    const response: ApiResponse = {
      success: true,
      data: status,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/2fa/backup-codes:
 *   post:
 *     summary: Regenerate backup codes
 *     description: Generate new set of backup codes (invalidates old ones)
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Current TOTP code
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: New backup codes generated
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
 *                     backupCodes:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid verification code
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const regenerateBackupCodes = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = regenerateSchema.parse(req.body);
    const userId = req.user!.id;

    const backupCodes = await twoFactorService.regenerateBackupCodes(
      userId,
      token
    );

    const response: ApiResponse = {
      success: true,
      data: { backupCodes },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
