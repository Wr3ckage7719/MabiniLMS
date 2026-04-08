// filepath: d:\MabiniLMS\server\src\routes\twoFactor.ts
import express from 'express';
import * as twoFactorController from '../controllers/twoFactor.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All 2FA routes require authentication
router.use(authenticate);

// Setup 2FA (generate QR code)
router.post('/setup', twoFactorController.setup2FA);

// Verify and enable 2FA
router.post('/verify', twoFactorController.verify2FA);

// Disable 2FA
router.post('/disable', twoFactorController.disable2FA);

// Get 2FA status
router.get('/status', twoFactorController.get2FAStatus);

// Regenerate backup codes
router.post('/backup-codes', twoFactorController.regenerateBackupCodes);

export default router;
