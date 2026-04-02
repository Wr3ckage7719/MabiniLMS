import { z } from 'zod';
import { UserRole } from './index.js';

// Allowed institutional domain
export const ALLOWED_DOMAIN = 'mabinicolleges.edu.ph';

// ============================================
// Google OAuth Schemas
// ============================================

export const googleOAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

export const googleTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

// ============================================
// Types
// ============================================

export type GoogleOAuthCallbackInput = z.infer<typeof googleOAuthCallbackSchema>;
export type GoogleTokens = z.infer<typeof googleTokensSchema>;

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  hd?: string; // Hosted domain (for Google Workspace accounts)
}

export interface GoogleDriveToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scope: string;
}

export interface OAuthUrlResponse {
  url: string;
  state?: string;
}

export interface OAuthSession {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    avatar_url: string | null;
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  google_tokens?: {
    access_token: string;
    expires_at: string;
    has_drive_scope: boolean;
  };
}

// Google API scopes
export const GOOGLE_SCOPES = {
  // Basic profile (always needed)
  PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
  EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
  OPENID: 'openid',
  
  // Google Drive scopes
  DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file', // Access to files created/opened by app
  DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly', // Read-only access to all files
  DRIVE_METADATA: 'https://www.googleapis.com/auth/drive.metadata.readonly', // Metadata only
};

// Default scopes for authentication
export const DEFAULT_AUTH_SCOPES = [
  GOOGLE_SCOPES.OPENID,
  GOOGLE_SCOPES.PROFILE,
  GOOGLE_SCOPES.EMAIL,
];

// Scopes needed for Drive integration
export const DRIVE_SCOPES = [
  ...DEFAULT_AUTH_SCOPES,
  GOOGLE_SCOPES.DRIVE_FILE,
];

/**
 * Validate that an email belongs to the allowed institutional domain
 */
export const isInstitutionalEmail = (email: string): boolean => {
  const emailLower = email.toLowerCase();
  return emailLower.endsWith(`@${ALLOWED_DOMAIN}`);
};

/**
 * Extract domain from email
 */
export const getEmailDomain = (email: string): string => {
  return email.split('@')[1]?.toLowerCase() || '';
};
