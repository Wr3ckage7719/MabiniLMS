import { z } from 'zod';
import { UserRole } from './index.js';

// ============================================
// Authentication Schemas
// ============================================

export const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  role: z.nativeEnum(UserRole).optional().default(UserRole.STUDENT),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: z.string().optional(), // Optional 2FA code
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const studentCredentialSignupSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

// ============================================
// User/Profile Schemas
// ============================================

export const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().nullable().optional(),
});

export const getUserByIdSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
});

// ============================================
// Type Exports
// ============================================

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type StudentCredentialSignupInput = z.infer<typeof studentCredentialSignupSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type GetUserByIdParams = z.infer<typeof getUserByIdSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// ============================================
// Response Types
// ============================================

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  pending_approval?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: UserProfile;
  session: AuthSession;
  requires2FA?: boolean; // Flag to indicate 2FA is required
  tempToken?: string; // Temporary token for 2FA verification
}

export interface PaginatedUsers {
  users: UserProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
