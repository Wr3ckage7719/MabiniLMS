# MabiniLMS - Learning Management System

> **Status:** ✅ Backend Complete | 🚧 Frontend Integration Pending  
> **Version:** 1.0.0  
> **Last Updated:** April 4, 2026

A comprehensive Learning Management System built for Mabini Colleges with Google OAuth, assignment management, grading, notifications, and analytics.

---

## 🎯 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (Supabase)
- Google Cloud project with OAuth credentials

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/MabiniLMS.git
cd MabiniLMS

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database setup
# See docs/DATABASE_SETUP.md

# Start development server
cd server
npm run dev
```

---

## 📚 Documentation

- **[Getting Started](docs/README.md)** - Complete setup guide
- **[API Documentation](DOCUMENTATION.md)** - All 58 API endpoints
- **[Frontend Integration](FRONTEND_INTEGRATION_GUIDE.md)** - React/Vite setup
- **[Database Setup](docs/DATABASE_SETUP.md)** - Database configuration
- **[Google OAuth Setup](docs/phase-5-google-oauth-setup.md)** - OAuth configuration

---

## ✨ Features

### ✅ Completed Features

#### 🔐 Authentication & Authorization
- Email/password authentication
- Google OAuth 2.0 integration
- Email verification system
- Password reset functionality
- Role-based access control (Admin, Teacher, Student)

#### 📚 Course Management
- Create, update, delete courses
- Course materials with Google Drive integration
- Student enrollment system
- Course analytics

#### 📝 Assignments & Submissions
- Assignment creation with types (exam, quiz, activity)
- Google Drive file submissions
- Deadline management
- Anti-cheat violation tracking
- Proctored exam support

#### 📊 Grading System
- Flexible grading (points/percentage/letter grades)
- Bulk grading (up to 50 submissions)
- Grade statistics and analytics
- Grade export (CSV/JSON)
- Automatic submission status updates

#### 🔔 Notifications
- 11 notification types
- 4 priority levels (low, normal, high, urgent)
- In-app notification center
- Programmatic triggers for common events

#### 🔍 Search & Discovery
- Global multi-entity search
- Search highlighting
- Faceted search results
- Fuzzy matching support

#### 📈 Analytics
- Course analytics (completion rates, grade distributions)
- Student progress tracking
- Teacher performance metrics
- Platform-wide statistics

#### ⚡ Batch Operations
- Bulk student enrollment (up to 100)
- Grade export (CSV/JSON)
- Student import from CSV (up to 500)
- Course duplication

#### 🛡️ Quality & Reliability
- Comprehensive error handling
- Structured logging with Winston
- Input validation with Zod
- Input sanitization (XSS protection)
- 330 passing tests (100% coverage)
- TypeScript type safety

---

## 🏗️ Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** PostgreSQL (Supabase)
- **ORM:** Supabase Client
- **Authentication:** Supabase Auth + Google OAuth
- **Validation:** Zod
- **Testing:** Vitest
- **Logging:** Winston

### Frontend (Integration Ready)
- **Framework:** React 18 with Vite
- **Styling:** Tailwind CSS
- **State Management:** React Query (recommended)
- **Routing:** React Router v6 (recommended)

### External Services
- **Supabase:** Database, Auth, Storage
- **Google Cloud:** OAuth, Drive API
- **Email:** Mock service (integration-ready)

---

## 📁 Project Structure

```
MabiniLMS/
├── server/                    # Backend application
│   ├── src/
│   │   ├── controllers/      # HTTP request handlers
│   │   ├── routes/           # API route definitions
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Express middleware
│   │   ├── types/            # TypeScript types & Zod schemas
│   │   ├── utils/            # Utility functions
│   │   └── index.ts          # Application entry point
│   ├── tests/                # Test suites
│   │   ├── unit/            # Unit tests
│   │   └── integration/     # Integration tests
│   └── migrations/           # Database migrations
├── client/                   # Frontend (empty - ready for integration)
├── docs/                     # Documentation
└── .github/                  # CI/CD workflows
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# View test UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

**Test Results:**
- ✅ 330 tests passing
- ✅ 10 test suites
- ✅ Zero failures
- ✅ Comprehensive coverage

---

## 🚀 API Overview

**Total Endpoints:** 58

### Authentication (8 endpoints)
- POST `/api/auth/signup` - Register new user
- POST `/api/auth/login` - Email/password login
- POST `/api/auth/google` - Google OAuth
- POST `/api/auth/logout` - Logout
- POST `/api/auth/verify-email` - Verify email
- POST `/api/auth/resend-verification` - Resend verification
- POST `/api/auth/forgot-password` - Request password reset
- POST `/api/auth/reset-password` - Reset password

### Courses (5 endpoints)
- GET/POST `/api/courses`
- GET/PUT/DELETE `/api/courses/:id`

### Enrollments (3 endpoints)
- GET/POST `/api/enrollments`
- DELETE `/api/enrollments/:id`

### Assignments (5 endpoints)
- GET/POST `/api/assignments`
- GET/PUT/DELETE `/api/assignments/:id`

### Grades (8 endpoints)
- GET/POST `/api/grades`
- GET/PUT/DELETE `/api/grades/:id`
- GET `/api/grades/assignment/:assignmentId/stats`
- POST `/api/grades/bulk`

### Notifications (7 endpoints)
- GET/POST `/api/notifications`
- GET/PUT/DELETE `/api/notifications/:id`
- PUT `/api/notifications/mark-all-read`
- GET `/api/notifications/unread-count`

### Search (5 endpoints)
- GET `/api/search` - Global search
- GET `/api/search/courses`
- GET `/api/search/users`
- GET `/api/search/assignments`
- GET `/api/search/materials`

### Analytics (5 endpoints)
- GET `/api/analytics/course/:courseId`
- GET `/api/analytics/student/:studentId`
- GET `/api/analytics/teacher/:teacherId`
- GET `/api/analytics/platform`
- GET `/api/analytics/export/:courseId`

### Batch Operations (5 endpoints)
- POST `/api/batch/enroll` - Bulk enrollment
- POST `/api/batch/export-grades` - Grade export
- POST `/api/batch/import-students` - CSV import
- POST `/api/batch/copy-course` - Course duplication
- GET `/api/batch/export-status/:batchId`

*See [DOCUMENTATION.md](DOCUMENTATION.md) for complete API reference.*

---

## 🔒 Security Features

- ✅ JWT-based authentication
- ✅ Row-level security (RLS) in database
- ✅ Input validation (Zod schemas)
- ✅ Input sanitization (XSS protection)
- ✅ SQL injection prevention
- ✅ CORS configuration
- ✅ Rate limiting ready
- ✅ Environment variable protection
- ✅ Secure password hashing
- ✅ Token expiration handling

---

## 🌍 Environment Variables

Required environment variables (see `.env.example`). In production, mirror the email settings in Admin Settings > System Settings so the runtime values stay aligned with the server defaults.

```env
# Server
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Email (optional - defaults can be overridden in Admin Settings > System Settings)
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply@mabinicolleges.edu.ph
EMAIL_FROM_NAME=MabiniLMS
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm start                # Start production server

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:ui          # Test UI
npm run test:coverage    # Coverage report

# Code Quality
npm run lint             # ESLint check
npm run format           # Prettier format
npm run type-check       # TypeScript check
```

### Code Style

- **TypeScript:** Strict mode enabled
- **Linting:** ESLint with recommended rules
- **Formatting:** Prettier
- **Commit Convention:** Conventional Commits

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 👥 Team

**Mabini Colleges LMS Development Team**

---

## 📞 Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/yourusername/MabiniLMS/issues)
- Documentation: [docs/README.md](docs/README.md)

---

## 🎯 Roadmap

### ✅ Phase 1-5: Complete
- Core functionality
- Google integration
- Testing framework
- All CRUD operations
- Advanced features

### 🚧 Next Steps
- [ ] Frontend React application
- [ ] Real-time features (WebSockets)
- [ ] Mobile app
- [ ] Advanced analytics dashboard
- [ ] Quiz/exam builder
- [ ] Video conferencing integration
- [ ] Parent portal
- [ ] Mobile notifications

---

**Built with ❤️ for Mabini Colleges**
