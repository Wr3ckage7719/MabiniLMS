import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  ALLOWED_DOMAIN,
  isInstitutionalEmail,
  GoogleUserInfo,
  OAuthSession,
  DRIVE_SCOPES,
} from '../types/google-oauth.js';
import logger from '../utils/logger.js';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

/**
 * Generate Google OAuth URL for sign-in
 */
export const getGoogleOAuthUrl = (includeDriveScope: boolean = false): string => {
  if (!GOOGLE_CLIENT_ID) {
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Google OAuth is not configured',
      500
    );
  }

  const scopes = includeDriveScope ? DRIVE_SCOPES : DRIVE_SCOPES; // Always include Drive for this LMS
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Always show consent to get refresh token
    hd: ALLOWED_DOMAIN, // Hint for Google Workspace domain
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Exchange authorization code for tokens
 */
export const exchangeCodeForTokens = async (code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}> => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Google OAuth is not configured',
      500
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    logger.error('Failed to exchange code for tokens', { error });
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Failed to authenticate with Google',
      401
    );
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  }>;
};

/**
 * Get user info from Google
 */
export const getGoogleUserInfo = async (accessToken: string): Promise<GoogleUserInfo> => {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    logger.error('Failed to get Google user info');
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Failed to get user information from Google',
      401
    );
  }

  return response.json() as Promise<GoogleUserInfo>;
};

/**
 * Validate institutional email domain
 */
export const validateInstitutionalEmail = (email: string): void => {
  if (!isInstitutionalEmail(email)) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      `Only @${ALLOWED_DOMAIN} email addresses are allowed. Please sign in with your institutional email.`,
      403
    );
  }
};

/**
 * Determine user role from email (basic heuristic - can be customized)
 * For now: all users start as students, admins promote them
 */
export const determineRoleFromEmail = (_email: string): UserRole => {
  // Could add logic here to auto-assign teacher role based on email patterns
  // e.g., faculty.lastname@mabinicolleges.edu.ph → teacher
  return UserRole.STUDENT;
};

/**
 * Handle Google OAuth callback - main authentication flow
 */
export const handleGoogleCallback = async (code: string): Promise<OAuthSession> => {
  // 1. Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);
  
  // 2. Get user info from Google
  const googleUser = await getGoogleUserInfo(tokens.access_token);
  
  // 3. Validate institutional email
  validateInstitutionalEmail(googleUser.email);
  
  // 4. Check if user exists in Supabase
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(u => u.email === googleUser.email);
  
  let userId: string;
  let userRole: UserRole;
  
  if (existingUser) {
    // User exists - get their role from profile
    userId = existingUser.id;
    
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    userRole = (profile?.role as UserRole) || UserRole.STUDENT;
  } else {
    // Create new user in Supabase Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: googleUser.email,
      email_confirm: true,
      user_metadata: {
        first_name: googleUser.given_name,
        last_name: googleUser.family_name,
        avatar_url: googleUser.picture,
        google_id: googleUser.id,
        role: determineRoleFromEmail(googleUser.email),
      },
    });

    if (createError || !newUser.user) {
      logger.error('Failed to create user from Google OAuth', { error: createError?.message });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to create user account',
        500
      );
    }

    userId = newUser.user.id;
    userRole = determineRoleFromEmail(googleUser.email);

    // Create profile
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email: googleUser.email,
      first_name: googleUser.given_name,
      last_name: googleUser.family_name,
      role: userRole,
      avatar_url: googleUser.picture,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 5. Store Google tokens for Drive access
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  await supabaseAdmin.from('google_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || '',
    expires_at: expiresAt.toISOString(),
    scope: DRIVE_SCOPES.join(' '),
    updated_at: new Date().toISOString(),
  });

  // 6. Create Supabase session for the user
  // We use signInWithPassword with a generated password, or use admin API
  // For simplicity, we'll generate a custom JWT-like session
  await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Generate session token using Supabase admin
  const { error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: googleUser.email,
  });

  if (sessionError) {
    logger.error('Failed to generate session', { error: sessionError.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create session',
      500
    );
  }

  return {
    user: {
      id: userId,
      email: googleUser.email,
      first_name: googleUser.given_name,
      last_name: googleUser.family_name,
      role: userRole,
      avatar_url: googleUser.picture,
    },
    session: {
      access_token: tokens.access_token, // Google access token (also used for Drive)
      refresh_token: tokens.refresh_token || '',
      expires_in: tokens.expires_in,
      token_type: 'Bearer',
    },
    google_tokens: {
      access_token: tokens.access_token,
      expires_at: expiresAt.toISOString(),
      has_drive_scope: true,
    },
  };
};

/**
 * Refresh Google access token
 */
export const refreshGoogleToken = async (userId: string): Promise<{
  access_token: string;
  expires_at: string;
}> => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Google OAuth is not configured',
      500
    );
  }

  // Get stored refresh token
  const { data: tokenData, error } = await supabaseAdmin
    .from('google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .single();

  if (error || !tokenData?.refresh_token) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'No refresh token found. Please re-authenticate.',
      401
    );
  }

  // Request new access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.error('Failed to refresh Google token', { error: errorData });
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Failed to refresh authentication. Please sign in again.',
      401
    );
  }

  const tokens = await response.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Update stored token
  await supabaseAdmin.from('google_tokens').update({
    access_token: tokens.access_token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  return {
    access_token: tokens.access_token,
    expires_at: expiresAt.toISOString(),
  };
};

/**
 * Get valid Google access token for a user (auto-refresh if needed)
 */
export const getValidGoogleToken = async (userId: string): Promise<string> => {
  const { data: tokenData, error } = await supabaseAdmin
    .from('google_tokens')
    .select('access_token, expires_at, refresh_token')
    .eq('user_id', userId)
    .single();

  if (error || !tokenData) {
    throw new ApiError(
      ErrorCode.UNAUTHORIZED,
      'No Google authentication found. Please sign in with Google.',
      401
    );
  }

  // Check if token is expired or about to expire (5 min buffer)
  const expiresAt = new Date(tokenData.expires_at);
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  
  if (expiresAt.getTime() - Date.now() < bufferTime) {
    // Token expired or expiring soon - refresh it
    const refreshed = await refreshGoogleToken(userId);
    return refreshed.access_token;
  }

  return tokenData.access_token;
};

/**
 * Revoke Google tokens (on logout)
 */
export const revokeGoogleTokens = async (userId: string): Promise<void> => {
  const { data: tokenData } = await supabaseAdmin
    .from('google_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();

  if (tokenData?.access_token) {
    // Revoke token with Google
    await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
      method: 'POST',
    }).catch(() => {
      // Ignore revocation errors
    });
  }

  // Delete from database
  await supabaseAdmin
    .from('google_tokens')
    .delete()
    .eq('user_id', userId);
};
