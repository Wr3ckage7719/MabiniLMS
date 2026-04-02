# MabiniLMS Architecture Reference

This document defines the architectural patterns and conventions for the MabiniLMS project.

## Project Structure

```
MabiniLMS/
├── client/                 # React frontend (Vite + TypeScript)
├── server/                 # Express backend (TypeScript)
│   └── src/
│       ├── config/         # Configuration (Swagger, etc.)
│       ├── controllers/    # Request handlers
│       ├── middleware/     # Express middleware
│       ├── routes/         # Route definitions
│       ├── services/       # Business logic
│       ├── types/          # TypeScript types & Zod schemas
│       ├── utils/          # Utilities (logger, helpers)
│       ├── lib/            # External integrations (Supabase)
│       └── index.ts        # Server entry point
└── database-schema.sql     # PostgreSQL schema (Supabase)
```

## Architecture Layers

### Layer 1: Routes
**Location**: `server/src/routes/`
**Purpose**: Define API endpoints and HTTP routing
**Responsibilities**:
- Map HTTP methods to controller functions
- Apply middleware (auth, validation, rate limiting)
- Group related endpoints

**Pattern**:
```typescript
import { Router } from 'express';
import { authenticate, authorize, validate } from '../middleware/index.js';
import { UserRole } from '../types/index.js';
import * as controller from '../controllers/users.js';
import { getUserSchema } from '../types/users.js';

const router = Router();

router.get('/me', 
  authenticate, 
  controller.getCurrentUser
);

router.get('/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: getUserSchema }),
  controller.getUserById
);

export default router;
```

### Layer 2: Controllers
**Location**: `server/src/controllers/`
**Purpose**: Handle HTTP requests and responses
**Responsibilities**:
- Extract data from requests
- Call service layer functions
- Format responses
- Handle controller-level errors

**Pattern**:
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse, ApiError, ErrorCode } from '../types/index.js';
import * as userService from '../services/users.js';

export const getCurrentUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const user = await userService.getUserProfile(userId);
    
    if (!user) {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'User profile not found',
        404
      );
    }

    const response: ApiResponse = {
      success: true,
      data: user,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
```

### Layer 3: Services
**Location**: `server/src/services/`
**Purpose**: Business logic and database operations
**Responsibilities**:
- Implement business rules
- Interact with Supabase (database, auth, storage)
- Data transformation
- Complex operations

**Pattern**:
```typescript
import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';

export const getUserProfile = async (userId: string) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, role, avatar_url')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('Failed to fetch user profile', {
        userId,
        error: error.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to fetch user profile',
        500
      );
    }

    return data;
  } catch (error) {
    throw error;
  }
};
```

### Layer 4: Database (Supabase)
**Integration**: Via `@supabase/supabase-js` client
**Security**: Row-Level Security (RLS) policies
**Pattern**: Services use Supabase client for all database operations

## API Response Format

### Success Response
```typescript
{
  success: true,
  data: T  // Generic type
}
```

### Error Response
```typescript
{
  success: false,
  error: {
    code: ErrorCode,
    message: string,
    details?: any
  }
}
```

## Error Handling Pattern

### 1. Custom ApiError Class
```typescript
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
```

### 2. Error Codes Enum
```typescript
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',      // 400
  UNAUTHORIZED = 'UNAUTHORIZED',              // 401
  FORBIDDEN = 'FORBIDDEN',                    // 403
  NOT_FOUND = 'NOT_FOUND',                    // 404
  CONFLICT = 'CONFLICT',                      // 409
  INTERNAL_ERROR = 'INTERNAL_ERROR',          // 500
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED' // 429
}
```

### 3. Throwing Errors
```typescript
// In controllers or services
throw new ApiError(
  ErrorCode.NOT_FOUND,
  'Resource not found',
  404,
  { resourceId: id }
);
```

### 4. Error Handler Middleware
Centralized error handling in `middleware/errorHandler.ts`:
- Catches all errors
- Formats error responses
- Logs errors with context
- Handles Zod validation errors

## Validation Pattern

### 1. Define Zod Schemas
**Location**: `server/src/types/`
```typescript
import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  syllabus: z.string().optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
```

### 2. Use Validation Middleware
```typescript
import { validate } from '../middleware/validate.js';

router.post('/courses',
  authenticate,
  validate({ body: createCourseSchema }),
  controller.createCourse
);
```

### 3. Type-Safe Request Body
```typescript
export const createCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // req.body is now type-safe and validated
  const courseData: CreateCourseInput = req.body;
  // ...
};
```

## Authentication Pattern

### 1. JWT Validation Middleware
```typescript
import { authenticate } from '../middleware/auth.js';

router.get('/protected', authenticate, controller.handler);
```

### 2. Authorization Middleware
```typescript
import { authorize } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';

// Admin only
router.post('/admin', 
  authenticate, 
  authorize(UserRole.ADMIN), 
  controller.handler
);

// Admin or Teacher
router.post('/courses',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  controller.handler
);
```

### 3. Accessing User in Controllers
```typescript
export const handler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user!.id;      // UUID
  const userRole = req.user!.role;   // admin | teacher | student
  const userEmail = req.user!.email; // string
  // ...
};
```

## Middleware Composition

Order matters! Apply middleware in this sequence:

```typescript
router.method('/path',
  apiLimiter,           // 1. Rate limiting (if needed)
  authenticate,         // 2. JWT validation
  authorize(...roles),  // 3. Role check
  validate({ ... }),    // 4. Input validation
  controller.handler    // 5. Business logic
);
```

## Database Integration

### 1. Supabase Client
```typescript
import { supabaseAdmin } from '../lib/supabase.js';
```

### 2. Query Pattern
```typescript
const { data, error } = await supabaseAdmin
  .from('table_name')
  .select('columns')
  .eq('column', value)
  .single();

if (error) {
  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Database error', 500);
}
```

### 3. RLS Policies
All database tables have Row-Level Security enabled. The Supabase client automatically enforces policies based on the JWT token.

## Logging Pattern

### 1. Winston Logger
```typescript
import logger from '../utils/logger.js';
```

### 2. Error Logging
```typescript
logger.error('Operation failed', {
  userId: req.user?.id,
  error: error.message,
  correlationId: req.headers['x-correlation-id'],
});
```

### 3. Log Levels
- `error` - Errors only (default, minimal logging)
- `warn` - Warnings + errors
- `info` - Informational + warn + error
- `debug` - Debug + info + warn + error

## API Documentation Pattern

### Swagger JSDoc Comments
```typescript
/**
 * @openapi
 * /api/courses:
 *   get:
 *     summary: List all courses
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Course'
 */
```

## TypeScript Patterns

### 1. Strict Mode
`tsconfig.json` has `strict: true` enabled. All type errors must be resolved.

### 2. No Implicit Any
Always provide explicit types for function parameters and return values.

### 3. Type vs Interface
- Use `interface` for object shapes
- Use `type` for unions, intersections, primitives

### 4. Type-Only Imports
```typescript
import type { User } from '../types/index.js';
```

## File Naming Conventions

- **Controllers**: `resource-name.ts` (e.g., `users.ts`, `courses.ts`)
- **Services**: `resource-name.ts` (e.g., `users.ts`, `courses.ts`)
- **Routes**: `resource-name.ts` (e.g., `users.ts`, `courses.ts`)
- **Types**: `resource-name.ts` or `index.ts` for shared types
- **Middleware**: `descriptive-name.ts` (e.g., `auth.ts`, `validate.ts`)
- **Utilities**: `descriptive-name.ts` (e.g., `logger.ts`, `helpers.ts`)

## Common Anti-Patterns to Avoid

❌ **Business logic in controllers** - Move to services
❌ **Direct database queries in routes** - Use controllers → services
❌ **Missing error handling** - Always use try-catch in async functions
❌ **Unvalidated inputs** - Always validate with Zod
❌ **Missing authentication** - Protected routes must have `authenticate`
❌ **Inconsistent response format** - Always use `ApiResponse<T>`
❌ **Hardcoded values** - Use environment variables or constants
❌ **Missing TypeScript types** - Explicit types everywhere
❌ **Ignoring RLS policies** - Let Supabase enforce security

## Testing Strategy

### Unit Tests
- Test service layer logic
- Mock Supabase client
- Use Jest

### Integration Tests
- Test API endpoints
- Use Supertest
- Test with real database (test environment)

### E2E Tests
- Test full user flows
- Use Playwright
- Frontend + Backend integration
