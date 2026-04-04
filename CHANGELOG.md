# Changelog

All notable changes to MabiniLMS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-04

### Added - Backend Complete Release

#### TIER 1: Foundation
- Google OAuth 2.0 integration with Drive API
- Email verification system with token management
- Password reset functionality
- Vitest testing framework with 330 tests
- Database migration system with rollback support
- Pagination utilities (cursor and offset-based)
- Search utilities (fuzzy matching, highlighting)
- Winston logging system with file and console transports
- Custom error classes with middleware
- Zod validation framework
- XSS sanitization middleware

#### TIER 2: Assignments & Google Drive
- Assignment CRUD operations
- Three assignment types (exam, quiz, activity)
- Submission management system
- Google Drive file upload integration
- Anti-cheat violation tracking
- Late submission detection

#### TIER 3: Grading System
- Grade CRUD operations
- Multiple grading formats (points, percentage, letter)
- Automatic letter grade calculation
- Assignment-level statistics
- Bulk grading (up to 50 submissions)
- Grade export (CSV/JSON)

#### TIER 4: Advanced Features
- **Search:** Global multi-entity search with highlighting
- **Notifications:** 11 types, 4 priority levels, programmatic triggers
- **Analytics:** Course, student, teacher, and platform analytics
- **Batch Operations:** Bulk enrollment, grade export, student import, course copy

#### Database
- 11 PostgreSQL tables with Row Level Security
- 40+ RLS policies for role-based access
- Indexes on all foreign keys
- Automatic profile creation trigger
- Email verification and password reset tables

#### API
- 58 RESTful API endpoints
- Comprehensive error handling
- Request/response logging
- Input validation and sanitization
- CORS configuration

#### Testing
- 330 passing tests (128 unit, 202 integration)
- Zero TypeScript compilation errors
- Comprehensive coverage of all features
- GitHub Actions CI/CD pipeline

#### Documentation
- Complete API documentation
- Frontend integration guide
- Database setup guide
- Google OAuth setup guide
- Migration system documentation
- Implementation status tracking

### Security
- JWT-based authentication
- Row-level security in database
- Input validation with Zod
- XSS protection
- SQL injection prevention
- CORS configuration
- Secure password hashing
- Token expiration handling

---

## [Unreleased]

### Planned
- React frontend application
- Real-time notifications via WebSockets
- Email service integration (SendGrid/AWS SES)
- Cloud file storage integration
- Advanced analytics dashboard
- Mobile application
- Quiz/exam builder
- Video conferencing integration
- Parent portal
- Mobile push notifications

---

## Version History

- **1.0.0** (2026-04-04) - Backend complete, production ready
- **0.x.x** - Development and testing phases

---

**Note:** This project follows semantic versioning. Breaking changes increment the major version, new features increment the minor version, and bug fixes increment the patch version.
