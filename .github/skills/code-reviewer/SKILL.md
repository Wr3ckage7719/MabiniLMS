---
name: code-reviewer
description: 'Reviews code changes for MabiniLMS design patterns, TypeScript best practices, Express/Supabase conventions, error handling, validation, security, and architectural consistency. Use when reviewing PRs, git diffs, or code quality before merge.'
argument-hint: '[branch-name or file-path]'
---

# MabiniLMS Code Reviewer

Automatically reviews code changes against MabiniLMS architecture standards, design patterns, and best practices.

## When to Use

- **Pull Request Reviews**: Review all changes in a PR or branch
- **Pre-commit Checks**: Validate code before committing
- **Refactoring Validation**: Ensure changes maintain architectural standards
- **Onboarding Reviews**: Help new team members learn project conventions
- **Code Quality Gates**: Verify adherence to patterns before merging

## What This Reviews

### 🏗️ Architecture & Design Patterns
- **Separation of Concerns**: Routes → Controllers → Services → Database
- **Middleware Usage**: Correct auth, validation, error handling placement
- **Error Handling**: Proper use of ApiError class and error codes
- **Async/Await Patterns**: No unhandled promises or missing try-catch

### 📝 TypeScript & Type Safety
- **Type Annotations**: No implicit `any` types
- **Interface vs Type**: Consistent usage (interfaces for objects, types for unions)
- **Zod Schema Validation**: All request inputs validated with Zod
- **Type Imports**: Use `import type` for type-only imports
- **Strict Mode Compliance**: No TypeScript errors or warnings

### 🔐 Security & Authentication
- **JWT Validation**: All protected routes use `authenticate` middleware
- **Authorization Checks**: Role-based access with `authorize(UserRole.X)`
- **Input Sanitization**: No raw user input in queries
- **RLS Policy Compliance**: Services use Supabase client for automatic RLS
- **Secrets Management**: No hardcoded credentials, use environment variables

### 📊 API Design & Consistency
- **Response Format**: All responses use `ApiResponse<T>` type
- **HTTP Status Codes**: Correct status codes (200, 201, 400, 401, 403, 404, 500)
- **Endpoint Naming**: RESTful conventions (plural nouns, correct HTTP verbs)
- **Pagination**: List endpoints support `page` and `limit` query params
- **Swagger Documentation**: JSDoc comments for OpenAPI spec generation

### ✅ Validation & Error Handling
- **Zod Schemas**: Define schemas in `types/` folder
- **Validation Middleware**: Use `validate({ body, query, params })` 
- **Error Codes**: Use appropriate `ErrorCode` enum values
- **Error Messages**: User-friendly, actionable messages
- **Logging**: Errors logged with context (correlation ID, user ID, path)

### 🧹 Code Quality & Naming
- **Naming Conventions**:
  - Variables/functions: `camelCase`
  - Classes/Types/Interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Files: `kebab-case.ts` for utilities, `PascalCase.ts` for classes
- **Function Size**: Keep functions under 50 lines
- **Comments**: Only for complex logic, not obvious code
- **No Dead Code**: Remove commented-out code and unused imports

### 🚀 Performance & Best Practices
- **Database Queries**: Select only needed columns, use indexes
- **Rate Limiting**: Applied to appropriate endpoints
- **Async Operations**: Proper error handling in async functions
- **Memory Leaks**: Close connections, remove event listeners
- **Import Organization**: Group by external → internal → types

## Review Procedure

Follow these steps when reviewing code:

### 1. Identify Changes
```bash
# Review current branch against main
git diff main...HEAD

# Review specific files
git diff HEAD -- path/to/file.ts

# Review staged changes
git diff --cached
```

### 2. Analyze Each File

For each changed file, check:

#### Backend Files (`server/src/**`)
1. **Structure**: Correct folder (controllers, services, routes, middleware, types)
2. **Imports**: Organized, no unused imports
3. **Types**: All function parameters and returns typed
4. **Error Handling**: Try-catch blocks, proper ApiError usage
5. **Authentication**: Protected routes have auth middleware
6. **Validation**: Request validation with Zod schemas
7. **Logging**: Errors logged appropriately
8. **Documentation**: JSDoc for public APIs

#### Frontend Files (`client/src/**`)
1. **React Best Practices**: Hooks rules, prop types, key props
2. **State Management**: Proper React Query usage
3. **API Integration**: Correct endpoint calls with error handling
4. **Accessibility**: ARIA labels, semantic HTML
5. **Styling**: Tailwind conventions, no inline styles

### 3. Check Cross-Cutting Concerns

- **Breaking Changes**: API contract changes documented
- **Database Migrations**: Schema changes with migration scripts
- **Environment Variables**: New vars documented in README
- **Dependencies**: New packages justified and secure
- **Tests**: Critical paths covered (if tests exist)

### 4. Generate Review Report

Provide structured feedback using this format:

```markdown
## Code Review Summary

### ✅ Strengths
- [List what was done well]

### ⚠️ Issues Found

#### 🔴 Critical (Must Fix)
- [Security issues, breaking changes, bugs]

#### 🟡 Warnings (Should Fix)
- [Pattern violations, type safety, error handling]

#### 🔵 Suggestions (Nice to Have)
- [Optimizations, refactoring, readability]

### 📋 Detailed Findings

#### File: `path/to/file.ts`

**Line X-Y**: Issue description
- **Problem**: What's wrong
- **Impact**: Why it matters
- **Fix**: How to resolve
```

## Reference Materials

### MabiniLMS Architecture Patterns

See [Architecture Reference](./references/architecture.md) for:
- API response format standards
- Error handling patterns
- Middleware composition
- Service layer patterns
- Supabase RLS integration

### Code Quality Checklist

See [Review Checklist](./references/checklist.md) for:
- Complete item-by-item review checklist
- Common anti-patterns to avoid
- Quick reference for pattern compliance

### Review Examples

See [Example Reviews](./references/examples.md) for:
- Sample code review comments
- Before/after refactoring examples
- Pattern violation fixes

## Configuration

### Review Strictness Levels

**Standard** (default): Flag critical issues, warnings, and major suggestions
**Strict**: Flag everything including minor style issues
**Critical-Only**: Only security, bugs, and breaking changes

### Focus Areas

Optionally focus the review on specific areas:
- `--security`: Security and authentication only
- `--types`: TypeScript and type safety only
- `--patterns`: Design patterns and architecture only
- `--api`: API design and consistency only

## Tips for Best Results

1. **Review Small PRs**: Easier to review thoroughly (< 500 lines)
2. **Provide Context**: Explain the "why" in PR description
3. **Self-Review First**: Run this skill before submitting PR
4. **Iterative Reviews**: Address feedback in follow-up commits
5. **Discussion**: Use review comments for architectural decisions

## Integration with Workflow

### Pre-Commit Hook
```bash
# .github/hooks/pre-commit.json
{
  "name": "code-review",
  "event": "PreToolUse",
  "command": "copilot /code-reviewer --critical-only"
}
```

### CI/CD Integration
Add to GitHub Actions workflow:
```yaml
- name: Code Review
  run: copilot /code-reviewer ${{ github.event.pull_request.head.ref }}
```

## Anti-Patterns to Avoid

❌ **Don't**: Review without understanding context
✅ **Do**: Read PR description and related issues first

❌ **Don't**: Nitpick formatting (let Prettier handle it)
✅ **Do**: Focus on logic, patterns, and architecture

❌ **Don't**: Request changes without explaining why
✅ **Do**: Explain impact and provide better alternatives

❌ **Don't**: Approve without actually reviewing
✅ **Do**: Verify critical paths and test changes

## Success Criteria

A code review is complete when:
- ✅ All critical issues are resolved
- ✅ Security and authentication patterns verified
- ✅ Type safety confirmed (no TypeScript errors)
- ✅ Error handling is comprehensive
- ✅ Code follows MabiniLMS architectural patterns
- ✅ API documentation is up to date
- ✅ No breaking changes without migration plan

## Quick Start

```
# Review current PR
/code-reviewer

# Review specific branch
/code-reviewer feature/new-api-endpoint

# Review specific file
/code-reviewer server/src/controllers/courses.ts

# Review with focus
/code-reviewer --security
```

---

**Note**: This skill enforces MabiniLMS-specific patterns. For generic TypeScript reviews, use the standard code review tools.
