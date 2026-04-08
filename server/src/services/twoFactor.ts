// filepath: d:\MabiniLMS\server\src\services\twoFactor.ts
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';

const APP_NAME = 'MabiniLMS';

interface TwoFactorSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

interface TwoFactorAttempt {
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
}

/**
 * Generate a new 2FA secret and QR code
 */
export const generateSecret = async (
  userId: string,
  email: string
): Promise<TwoFactorSecret> => {
  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 32,
  });

  if (!secret.otpauth_url) {
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to generate 2FA secret',
      500
    );
  }

  // Generate QR code
  const qrCode = await qrcode.toDataURL(secret.otpauth_url);

  // Generate 10 backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Hash backup codes before storing
  const hashedBackupCodes = backupCodes.map((code) =>
    crypto.createHash('sha256').update(code).digest('hex')
  );

  // Store in database (disabled by default until verified)
  const { error } = await supabase
    .from('two_factor_auth')
    .upsert({
      user_id: userId,
      secret: secret.base32,
      backup_codes: hashedBackupCodes,
      is_enabled: false,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(
      ErrorCode.DATABASE_ERROR,
      `Failed to save 2FA secret: ${error.message}`,
      500
    );
  }

  return {
    secret: secret.base32,
    qrCode,
    backupCodes, // Return plain text codes for user to save
  };
};

/**
 * Verify TOTP token
 */
export const verifyToken = (secret: string, token: string): boolean => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps before/after current
  });
};

/**
 * Verify backup code
 */
const verifyBackupCode = async (
  userId: string,
  code: string
): Promise<boolean> => {
  // Hash the provided code
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

  // Get user's backup codes
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('backup_codes')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return false;
  }

  // Check if code exists
  const codeIndex = data.backup_codes.indexOf(hashedCode);
  if (codeIndex === -1) {
    return false;
  }

  // Remove used backup code
  const updatedCodes = data.backup_codes.filter(
    (_: string, idx: number) => idx !== codeIndex
  );

  await supabase
    .from('two_factor_auth')
    .update({ backup_codes: updatedCodes })
    .eq('user_id', userId);

  return true;
};

/**
 * Enable 2FA for user after verifying initial token
 */
export const enableTwoFactor = async (
  userId: string,
  token: string
): Promise<void> => {
  // Get user's 2FA record
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('secret')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      '2FA not set up for this user',
      404
    );
  }

  // Verify token
  const isValid = verifyToken(data.secret, token);
  if (!isValid) {
    throw new ApiError(ErrorCode.INVALID_INPUT, 'Invalid verification code', 400);
  }

  // Enable 2FA
  const { error: updateError } = await supabase
    .from('two_factor_auth')
    .update({ is_enabled: true, enabled_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (updateError) {
    throw new ApiError(
      ErrorCode.DATABASE_ERROR,
      `Failed to enable 2FA: ${updateError.message}`,
      500
    );
  }
};

/**
 * Disable 2FA for user
 */
export const disableTwoFactor = async (
  userId: string,
  token: string
): Promise<void> => {
  // Get user's 2FA record
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('secret')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, '2FA not enabled', 404);
  }

  // Verify token before disabling
  const isValid = verifyToken(data.secret, token);
  if (!isValid) {
    throw new ApiError(ErrorCode.INVALID_INPUT, 'Invalid verification code', 400);
  }

  // Disable 2FA (keep record in case user wants to re-enable)
  const { error: updateError } = await supabase
    .from('two_factor_auth')
    .update({ is_enabled: false })
    .eq('user_id', userId);

  if (updateError) {
    throw new ApiError(
      ErrorCode.DATABASE_ERROR,
      `Failed to disable 2FA: ${updateError.message}`,
      500
    );
  }
};

/**
 * Verify 2FA code during login
 */
export const verifyTwoFactor = async (
  userId: string,
  code: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> => {
  // Rate limiting: Check recent failed attempts
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: recentAttempts, error: attemptsError } = await supabase
    .from('two_factor_attempts')
    .select('id')
    .eq('user_id', userId)
    .eq('success', false)
    .gte('created_at', fiveMinutesAgo);

  if (attemptsError) {
    console.error('Failed to check 2FA attempts:', attemptsError);
  }

  if (recentAttempts && recentAttempts.length >= 5) {
    throw new ApiError(
      ErrorCode.TOO_MANY_REQUESTS,
      'Too many failed attempts. Please try again in 5 minutes.',
      429
    );
  }

  // Get user's 2FA secret
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('secret, backup_codes')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, '2FA not enabled', 404);
  }

  // Try TOTP verification first
  let isValid = verifyToken(data.secret, code);

  // If TOTP fails, try backup code
  if (!isValid) {
    isValid = await verifyBackupCode(userId, code);
  }

  // Log attempt
  await logTwoFactorAttempt({
    user_id: userId,
    ip_address: ipAddress,
    user_agent: userAgent,
    success: isValid,
  });

  if (!isValid) {
    throw new ApiError(
      ErrorCode.INVALID_INPUT,
      'Invalid verification code',
      400
    );
  }

  return true;
};

/**
 * Check if user has 2FA enabled
 */
export const isTwoFactorEnabled = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('is_enabled')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.is_enabled;
};

/**
 * Get 2FA status for user
 */
export const getTwoFactorStatus = async (userId: string) => {
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('is_enabled, enabled_at, backup_codes')
    .eq('user_id', userId)
    .single();

  if (error) {
    return {
      enabled: false,
      enabledAt: null,
      backupCodesRemaining: 0,
    };
  }

  return {
    enabled: data.is_enabled,
    enabledAt: data.enabled_at,
    backupCodesRemaining: data.backup_codes?.length || 0,
  };
};

/**
 * Regenerate backup codes
 */
export const regenerateBackupCodes = async (
  userId: string,
  token: string
): Promise<string[]> => {
  // Get user's 2FA record
  const { data, error } = await supabase
    .from('two_factor_auth')
    .select('secret')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, '2FA not enabled', 404);
  }

  // Verify token before regenerating
  const isValid = verifyToken(data.secret, token);
  if (!isValid) {
    throw new ApiError(ErrorCode.INVALID_INPUT, 'Invalid verification code', 400);
  }

  // Generate new backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  const hashedBackupCodes = backupCodes.map((code) =>
    crypto.createHash('sha256').update(code).digest('hex')
  );

  // Update database
  const { error: updateError } = await supabase
    .from('two_factor_auth')
    .update({ backup_codes: hashedBackupCodes })
    .eq('user_id', userId);

  if (updateError) {
    throw new ApiError(
      ErrorCode.DATABASE_ERROR,
      `Failed to regenerate backup codes: ${updateError.message}`,
      500
    );
  }

  return backupCodes;
};

/**
 * Log 2FA verification attempt
 */
const logTwoFactorAttempt = async (attempt: TwoFactorAttempt): Promise<void> => {
  try {
    await supabase.from('two_factor_attempts').insert(attempt);
  } catch (error) {
    // Don't throw - logging failures shouldn't break auth flow
    console.error('Failed to log 2FA attempt:', error);
  }
};

/**
 * Get recent 2FA attempts for user (admin/security monitoring)
 */
export const getTwoFactorAttempts = async (
  userId: string,
  limit: number = 50
) => {
  const { data, error } = await supabase
    .from('two_factor_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new ApiError(
      ErrorCode.DATABASE_ERROR,
      `Failed to fetch 2FA attempts: ${error.message}`,
      500
    );
  }

  return data;
};
