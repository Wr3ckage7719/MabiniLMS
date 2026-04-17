import { z } from 'zod';
import { UserRole } from './index.js';

// ============================================
// Authentication Schemas
// ============================================

const publicSignupRoleSchema = z.literal(UserRole.TEACHER);

const accountPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[!@#$%^&*]/, 'Password must contain at least one special character');

export const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  role: publicSignupRoleSchema.optional().default(UserRole.TEACHER),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: z.string().optional(), // Optional 2FA code
  twoFactorChallengeId: z.string().uuid('Invalid two-factor challenge').optional(),
  portal: z.enum(['app', 'admin']).optional().default('app'),
  remember_me: z.boolean().optional().default(true),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const studentCredentialSignupSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const studentSignupCompleteSchema = z.object({
  token: z.string().min(1, 'Signup token is required'),
  password: accountPasswordSchema,
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
});

export const teacherOnboardingCompleteSchema = z.object({
  token: z.string().min(1, 'Onboarding token is required'),
  password: accountPasswordSchema,
});

export const teacherSignupVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
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
export type StudentSignupCompleteInput = z.infer<typeof studentSignupCompleteSchema>;
export type TeacherOnboardingCompleteInput = z.infer<typeof teacherOnboardingCompleteSchema>;
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
  twoFactorChallengeId?: string;
}

export interface PaginatedUsers {
  users: UserProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
