# Code Review Checklist

Use this checklist when reviewing code changes in MabiniLMS.

## 🏗️ Architecture & Structure

### Separation of Concerns
- [ ] Routes only define endpoints and apply middleware
- [ ] Controllers only handle HTTP request/response
- [ ] Services contain all business logic
- [ ] No database queries in controllers
- [ ] No business logic in routes

### File Organization
- [ ] Files in correct directories (controllers/, services/, routes/, etc.)
- [ ] File names follow naming conventions (kebab-case)
- [ ] No duplicate code across files
- [ ] Related functionality grouped together

### Middleware Usage
- [ ] Authentication middleware applied to protected routes
- [ ] Authorization checks for role-specific endpoints
- [ ] Validation middleware for all user inputs
- [ ] Rate limiting on authentication endpoints
- [ ] Middleware applied in correct order

## 📝 TypeScript & Types

### Type Safety
- [ ] No `any` types (except where unavoidable)
- [ ] All function parameters have explicit types
- [ ] All function return types specified
- [ ] Proper generic type usage
- [ ] No TypeScript errors or warnings

### Type Organization
- [ ] Types defined in `types/` directory
- [ ] Interfaces for object shapes
- [ ] Type aliases for unions/intersections
- [ ] Exported types use PascalCase
- [ ] Use `import type` for type-only imports

### Zod Schemas
- [ ] All request schemas defined with Zod
- [ ] Schema types inferred with `z.infer<>`
- [ ] Schemas exported from `types/` directory
- [ ] Appropriate Zod validators used (min, max, email, uuid, etc.)

## 🔐 Security

### Authentication
- [ ] Protected routes use `authenticate` middleware
- [ ] JWT tokens validated on all protected endpoints
- [ ] User info accessed via `req.user`
- [ ] No authentication logic in business code

### Authorization
- [ ] Role checks use `authorize()` middleware
- [ ] Correct roles specified (Admin, Teacher, Student)
- [ ] Resource ownership verified in services
- [ ] No privilege escalation vulnerabilities

### Input Security
- [ ] All user inputs validated with Zod
- [ ] No raw user input in database queries
- [ ] File uploads have type and size restrictions
- [ ] No SQL injection vulnerabilities
- [ ] XSS prevention (no raw HTML rendering)

### Secrets & Configuration
- [ ] No hardcoded credentials
- [ ] Environment variables used for sensitive data
- [ ] `.env` file not committed
- [ ] API keys not exposed in client code

## 📊 API Design

### RESTful Conventions
- [ ] Endpoints use plural nouns (`/courses`, `/users`)
- [ ] Correct HTTP methods (GET, POST, PUT, PATCH, DELETE)
- [ ] Resource IDs in URL path (e.g., `/courses/:id`)
- [ ] Query params for filtering/pagination

### Response Format
- [ ] All responses use `ApiResponse<T>` type
- [ ] Success responses have `success: true, data: {...}`
- [ ] Error responses have `success: false, error: {...}`
- [ ] Consistent response structure

### HTTP Status Codes
- [ ] 200 OK for successful GET, PUT, PATCH
- [ ] 201 Created for successful POST
- [ ] 204 No Content for successful DELETE
- [ ] 400 Bad Request for validation errors
- [ ] 401 Unauthorized for auth failures
- [ ] 403 Forbidden for authorization failures
- [ ] 404 Not Found for missing resources
- [ ] 409 Conflict for duplicate resources
- [ ] 500 Internal Server Error for unexpected errors

### Pagination
- [ ] List endpoints support `page` and `limit` query params
- [ ] Default pagination values provided
- [ ] Total count included in response (if needed)

## ✅ Validation & Error Handling

### Input Validation
- [ ] All request bodies validated
- [ ] All query params validated
- [ ] All URL params validated
- [ ] Validation middleware used in routes
- [ ] Clear validation error messages

### Error Handling
- [ ] All async functions have try-catch blocks
- [ ] Errors use `ApiError` class
- [ ] Correct `ErrorCode` enum values
- [ ] HTTP status codes match error types
- [ ] Errors passed to `next(error)` in controllers

### Error Logging
- [ ] Errors logged with `logger.error()`
- [ ] Correlation IDs included in logs
- [ ] User ID and request path logged
- [ ] No sensitive data in logs

## 🧹 Code Quality

### Naming Conventions
- [ ] Variables/functions: `camelCase`
- [ ] Classes/Types/Interfaces: `PascalCase`
- [ ] Constants: `UPPER_SNAKE_CASE`
- [ ] Private fields: `_prefixed`
- [ ] Boolean variables: `is`, `has`, `should` prefix

### Function Quality
- [ ] Functions under 50 lines
- [ ] Single responsibility per function
- [ ] Descriptive function names
- [ ] Pure functions where possible
- [ ] Minimal side effects

### Code Clarity
- [ ] Self-documenting code (clear variable names)
- [ ] Comments only for complex logic
- [ ] No commented-out code
- [ ] No console.log() statements (use logger)
- [ ] No TODO comments (create issues instead)

### Imports
- [ ] No unused imports
- [ ] Imports organized (external → internal → types)
- [ ] Relative paths correct (`.js` extension for ES modules)
- [ ] No wildcard imports (`import *`)

## 🚀 Performance

### Database Queries
- [ ] Select only needed columns (not `SELECT *`)
- [ ] Use appropriate indexes
- [ ] Avoid N+1 queries
- [ ] Batch operations where possible
- [ ] Use pagination for large datasets

### Async Operations
- [ ] Promises properly awaited
- [ ] Parallel operations use `Promise.all()`
- [ ] No unnecessary sequential awaits
- [ ] Proper error handling in async code

### Memory & Resources
- [ ] No memory leaks (event listeners removed)
- [ ] Connections properly closed
- [ ] Large files streamed (not loaded into memory)
- [ ] Timeouts configured for external requests

## 📚 Documentation

### Code Documentation
- [ ] JSDoc comments for public APIs
- [ ] Complex logic explained with comments
- [ ] Function purposes clear from names/docs
- [ ] Type definitions self-documenting

### API Documentation
- [ ] Swagger JSDoc comments on endpoints
- [ ] Request/response examples provided
- [ ] Error responses documented
- [ ] Authentication requirements specified

### README & Guides
- [ ] README updated if architecture changes
- [ ] Environment variables documented
- [ ] Breaking changes documented
- [ ] Migration guides provided (if needed)

## 🧪 Testing (If Applicable)

### Test Coverage
- [ ] Unit tests for service layer
- [ ] Integration tests for API endpoints
- [ ] Edge cases covered
- [ ] Error scenarios tested

### Test Quality
- [ ] Tests are independent (no shared state)
- [ ] Clear test descriptions
- [ ] Mocks used appropriately
- [ ] Tests run successfully

## 🔄 Git & Version Control

### Commits
- [ ] Commit messages are clear and descriptive
- [ ] Commits are atomic (single logical change)
- [ ] No unrelated changes in commit
- [ ] No merge conflicts

### Pull Request
- [ ] PR description explains the "why"
- [ ] Related issues linked
- [ ] Breaking changes highlighted
- [ ] Screenshots/recordings for UI changes

## 🎯 MabiniLMS-Specific Patterns

### Backend Patterns
- [ ] Routes → Controllers → Services → Database flow
- [ ] Supabase client used for all database operations
- [ ] RLS policies respected (no bypassing)
- [ ] Winston logger used (not console.log)
- [ ] Rate limiting on auth endpoints

### Frontend Patterns (if applicable)
- [ ] React Query for data fetching
- [ ] Tailwind CSS for styling (no inline styles)
- [ ] Zod for form validation
- [ ] AuthContext for user state
- [ ] Protected routes use `ProtectedRoute` component

### Database Patterns
- [ ] Foreign keys properly defined
- [ ] Timestamps (`created_at`, `updated_at`) present
- [ ] UUIDs for primary keys
- [ ] Proper indexes on foreign keys
- [ ] RLS policies defined for new tables

## 📝 Review Severity Guide

### 🔴 Critical (Must Fix Before Merge)
- Security vulnerabilities
- Breaking changes without migration
- Type errors
- Runtime errors
- Data loss risks

### 🟡 Warning (Should Fix)
- Pattern violations
- Missing error handling
- Performance issues
- Incomplete validation
- Missing documentation

### 🔵 Suggestion (Nice to Have)
- Code style improvements
- Refactoring opportunities
- Optimization ideas
- Better naming

## ✅ Final Checklist

Before approving a PR:
- [ ] All critical issues resolved
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Security verified
- [ ] Performance acceptable
- [ ] Code follows MabiniLMS patterns

---

**Remember**: The goal is to maintain code quality while being constructive and helpful. Explain the "why" behind each suggestion.
