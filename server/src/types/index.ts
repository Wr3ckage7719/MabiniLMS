import { z } from 'zod';
import { Request } from 'express';

// User role enum
export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  STUDENT = 'student',
}

// Extended Express Request with user info
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Error codes
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  INVALID_INPUT = 'INVALID_INPUT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
}

// Custom error class
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Zod schemas for common validations
export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email();
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;
