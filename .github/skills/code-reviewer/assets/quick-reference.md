# Quick Review Reference Card

Use this as a fast checklist during code reviews.

## Must-Have Patterns ✅

### Every Protected Route
```typescript
router.method('/path',
  authenticate,              // JWT validation
  authorize(...roles),       // Role check (if needed)
  validate({ body: schema }), // Input validation
  controller.handler         // Business logic
);
```

### Every Controller
```typescript
export const handler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Extract & validate data
    const data = req.body;
    const userId = req.user!.id;
    
    // 2. Call service layer
    const result = await service.doSomething(data);
    
    // 3. Return consistent response
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
```

### Every Service
```typescript
export const doSomething = async (data: Input): Promise<Output> => {
  // 1. Validate business rules
  // 2. Query database via Supabase
  const { data, error } = await supabaseAdmin...
  
  // 3. Handle errors
  if (error) {
    logger.error('Operation failed', { error: error.message });
    throw new ApiError(ErrorCode.X, 'Message', statusCode);
  }
  
  // 4. Return typed result
  return data;
};
```

## Red Flags 🚨

| Issue | Impact | Fix |
|-------|--------|-----|
| No try-catch | App crashes | Wrap async in try-catch |
| Missing validation | Security risk | Add Zod schema + middleware |
| No authentication | Unauthorized access | Add `authenticate` middleware |
| Business logic in controller | Hard to test | Move to service layer |
| Direct Supabase in controller | Tight coupling | Use service layer |
| `any` types | No type safety | Add explicit types |
| console.log() | Poor logging | Use `logger.error()` |
| Hardcoded values | Not configurable | Use env vars/constants |
| Missing error codes | Inconsistent errors | Use `ErrorCode` enum |
| No JSDoc on public API | Poor docs | Add Swagger comments |

## Quick Checks ⚡

### File Structure
```
server/src/
├── routes/         ✓ Only routing, middleware
├── controllers/    ✓ Only HTTP handling
├── services/       ✓ Business logic, DB queries
├── types/          ✓ Zod schemas, interfaces
└── middleware/     ✓ Reusable middleware
```

### Import Order
```typescript
// 1. External packages
import express from 'express';
import { z } from 'zod';

// 2. Internal modules
import { userService } from '../services/users.js';
import { authenticate } from '../middleware/auth.js';

// 3. Types
import type { AuthRequest } from '../types/index.js';
```

### Response Format
```typescript
// Success
{
  success: true,
  data: { ... }
}

// Error
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human message',
    details: { ... }
  }
}
```

## Status Code Reference

| Code | When to Use | Example |
|------|-------------|---------|
| 200 | Successful GET, PUT, PATCH | Resource retrieved/updated |
| 201 | Successful POST | Resource created |
| 204 | Successful DELETE | Resource deleted |
| 400 | Validation error | Invalid input |
| 401 | Auth failed | Invalid/missing token |
| 403 | Insufficient permissions | Wrong role |
| 404 | Resource not found | Course doesn't exist |
| 409 | Resource conflict | Duplicate enrollment |
| 429 | Rate limit exceeded | Too many requests |
| 500 | Server error | Unexpected error |

## Error Code Mapping

```typescript
ErrorCode.VALIDATION_ERROR     → 400
ErrorCode.UNAUTHORIZED         → 401
ErrorCode.FORBIDDEN            → 403
ErrorCode.NOT_FOUND            → 404
ErrorCode.CONFLICT             → 409
ErrorCode.INTERNAL_ERROR       → 500
ErrorCode.RATE_LIMIT_EXCEEDED  → 429
```

## Severity Guide

### 🔴 Critical - Block Merge
- Security vulnerabilities
- Type errors
- Runtime errors
- Missing error handling
- No authentication on protected routes
- SQL injection risks

### 🟡 Warning - Should Fix
- Pattern violations (logic in wrong layer)
- Missing validation
- Inconsistent response format
- Performance issues
- Missing documentation

### 🔵 Suggestion - Nice to Have
- Better naming
- Code refactoring
- Performance optimization
- Additional error details

## Common Fixes

### Missing Error Handling
```typescript
// ❌ Before
const data = await service.getData();

// ✅ After
try {
  const data = await service.getData();
} catch (error) {
  next(error);
}
```

### Missing Validation
```typescript
// ❌ Before
router.post('/api/courses', authenticate, controller.create);

// ✅ After
router.post('/api/courses',
  authenticate,
  validate({ body: createCourseSchema }),
  controller.create
);
```

### Wrong Layer
```typescript
// ❌ Before (DB in controller)
const { data } = await supabaseAdmin.from('users')...

// ✅ After (DB in service)
const user = await userService.getUser(id);
```

### Missing Types
```typescript
// ❌ Before
const updateUser = async (req, res) => {

// ✅ After
const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
```

## Test Before Approving

```bash
# TypeScript compilation
npm run build

# Linting
npm run lint

# Manual test
npm run dev
# Test endpoint with curl/Postman

# Check logs
tail -f server/logs/error.log
```

---

**Quick Approval Checklist**:
- [ ] No red flags above
- [ ] Patterns match reference
- [ ] TypeScript compiles
- [ ] Tests pass (if any)
- [ ] Documentation updated
