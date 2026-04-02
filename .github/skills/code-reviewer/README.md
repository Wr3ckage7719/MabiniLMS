# Code Reviewer Skill

Automatically reviews code changes in MabiniLMS for design pattern compliance, TypeScript best practices, and architectural consistency.

## Structure

```
code-reviewer/
├── SKILL.md                    # Main skill definition
├── references/
│   ├── architecture.md         # MabiniLMS architecture patterns
│   ├── checklist.md            # Comprehensive review checklist
│   └── examples.md             # Before/after code examples
└── assets/
    └── quick-reference.md      # Quick reference card
```

## Usage

### From Chat
```
/code-reviewer
```

### Review PR
```
/code-reviewer feature/new-endpoint
```

### Review Specific File
```
/code-reviewer server/src/controllers/courses.ts
```

### Focus on Security
```
/code-reviewer --security
```

## What It Reviews

- **Architecture**: Routes → Controllers → Services pattern
- **TypeScript**: Type safety, no `any`, proper interfaces
- **Security**: Auth, authorization, input validation
- **API Design**: RESTful conventions, response format
- **Error Handling**: Try-catch, ApiError usage, logging
- **Code Quality**: Naming, function size, clarity
- **Performance**: Query optimization, async patterns

## Review Output

The skill generates structured feedback with:
- ✅ **Strengths**: What was done well
- 🔴 **Critical Issues**: Must fix before merge
- 🟡 **Warnings**: Should fix
- 🔵 **Suggestions**: Nice to have
- 📋 **Detailed Findings**: Line-by-line analysis

## References

- **[Architecture](./references/architecture.md)**: Complete pattern guide
- **[Checklist](./references/checklist.md)**: Item-by-item review list
- **[Examples](./references/examples.md)**: Real-world fixes
- **[Quick Reference](./assets/quick-reference.md)**: Fast lookup

## Integration

### Pre-Commit Hook
See SKILL.md for hook configuration

### GitHub Actions
See SKILL.md for CI/CD integration

## Customization

Edit `SKILL.md` to:
- Adjust review strictness
- Add project-specific patterns
- Include additional checks
- Modify output format

---

**Created**: Phase 1 Backend Implementation
**Version**: 1.0
**Scope**: MabiniLMS workspace
