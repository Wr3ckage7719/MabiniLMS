# Contributing to MabiniLMS

Thank you for your interest in contributing to MabiniLMS! This document provides guidelines and instructions for contributing.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain professionalism

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- PostgreSQL (Supabase account)
- Git

### Setup

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/MabiniLMS.git
   cd MabiniLMS
   ```

3. **Install dependencies**
   ```bash
   npm install
   cd server && npm install
   ```

4. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

5. **Run tests**
   ```bash
   npm test
   ```

---

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Development branch
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Urgent production fixes

### Creating a Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

---

## Coding Standards

### TypeScript

- Use **strict mode**
- Provide type annotations for function parameters
- Avoid `any` type unless absolutely necessary
- Use interfaces for object shapes
- Export types from `types/` directory

**Example:**
```typescript
// Good ✅
interface User {
  id: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
}

function getUserById(id: string): Promise<User> {
  // ...
}

// Bad ❌
function getUserById(id: any): Promise<any> {
  // ...
}
```

### Code Style

- **Linting:** ESLint with recommended rules
- **Formatting:** Prettier (run `npm run format`)
- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Required

### File Organization

```
server/src/
├── controllers/    # HTTP handlers
├── services/       # Business logic
├── routes/         # API routes
├── middleware/     # Express middleware
├── types/          # TypeScript types & Zod schemas
├── utils/          # Utility functions
└── index.ts        # App entry point
```

### Naming Conventions

- **Files:** kebab-case (`email-verification.ts`)
- **Variables/Functions:** camelCase (`getUserById`)
- **Classes/Interfaces:** PascalCase (`EmailService`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Types:** PascalCase with descriptive names

---

## Testing

### Test Requirements

- All new features **must** include tests
- Bug fixes **must** include regression tests
- Maintain or improve test coverage

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Specific file
npm test path/to/test.ts
```

### Writing Tests

**Example:**
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    const result = doSomething();
    expect(result).toBe(expected);
  });

  it('should handle errors', () => {
    expect(() => doSomethingBad()).toThrow();
  });
});
```

### Test Organization

- `tests/unit/` - Unit tests for pure functions
- `tests/integration/` - Integration tests for API endpoints

---

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test additions or changes
- `chore:` - Maintenance tasks

### Examples

```bash
feat(auth): add email verification system

Implements email verification with tokens that expire after 24 hours.
Includes resend functionality and verification status tracking.

Closes #123

---

fix(grades): calculate letter grades correctly

Previously, grades below 60% were assigned 'F' instead of showing
the exact percentage. Now shows both letter and percentage.

Fixes #456

---

docs(api): update authentication endpoint documentation

Added examples for Google OAuth flow and token refresh.
```

### Commit Message Rules

- Use imperative mood ("add" not "added")
- First line max 72 characters
- Reference issues/PRs when applicable
- Explain **why**, not just **what**

---

## Pull Request Process

### Before Submitting

1. ✅ All tests pass (`npm test`)
2. ✅ No linting errors (`npm run lint`)
3. ✅ Code is formatted (`npm run format`)
4. ✅ TypeScript compiles (`npm run build`)
5. ✅ Documentation is updated
6. ✅ Commits follow convention

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests passing

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests pass locally
```

### Review Process

1. Submit PR to `develop` branch
2. Automated tests run via GitHub Actions
3. Code review by maintainers
4. Address feedback
5. Approval and merge

### Getting Help

- **GitHub Issues:** For bugs and feature requests
- **Discussions:** For questions and ideas
- **Email:** For security issues

---

## Development Tips

### Debugging

```typescript
import { logger } from '@/utils/logger';

logger.debug('Debugging info', { userId, data });
logger.error('Error occurred', { error });
```

### Environment Variables

```typescript
// Use process.env with fallbacks
const port = process.env.PORT || 3000;

// Validate required vars on startup
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required');
}
```

### Error Handling

```typescript
import { AppError, ErrorCode } from '@/utils/errors';

// Throw descriptive errors
throw new AppError(
  'User not found',
  ErrorCode.NOT_FOUND,
  404
);
```

---

## Questions?

Feel free to:
- Open an issue for bugs
- Start a discussion for questions
- Submit a PR for improvements

**Thank you for contributing!** 🎉
