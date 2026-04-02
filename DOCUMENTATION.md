# MabiniLMS Documentation

A modern Learning Management System built with React, TypeScript, and Express.

## Table of Contents
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Development](#development)
- [Authentication & User Management](#authentication--user-management)
- [Course Management](#course-management)
- [API Documentation](#api-documentation)

---

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Git

### Installation
```bash
# Install dependencies
npm install

# Start development servers
npm run dev
```

**Development URLs:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Docs: http://localhost:3000/api-docs

---

## Project Structure

```
MabiniLMS/
├── client/              # React + Vite + TypeScript + Tailwind CSS
├── server/              # Express + TypeScript + Supabase
│   ├── src/
│   │   ├── config/      # Swagger/OpenAPI config
│   │   ├── controllers/ # Request handlers
│   │   ├── middleware/  # Auth, validation, rate limiting
│   │   ├── routes/      # Route definitions
│   │   ├── services/    # Business logic
│   │   ├── types/       # TypeScript types & Zod schemas
│   │   ├── utils/       # Logger utilities
│   │   └── lib/         # Supabase clients
│   └── logs/            # Application logs
└── docs/                # Additional documentation
```

---

## Tech Stack

### Frontend
- ⚡️ Vite - Fast build tool
- ⚛️ React 18 - UI library
- 🔷 TypeScript - Type safety
- 🎨 Tailwind CSS - Utility-first CSS
- 📱 PWA support

### Backend
- 🚂 Express - Web framework
- 🔷 TypeScript - Type safety
- 🗄️ Supabase - PostgreSQL + Auth + Storage
- 🔐 JWT Authentication
- 📝 Zod - Schema validation
- 🚦 Rate limiting
- 📊 Winston logging
- 📖 Swagger/OpenAPI docs

---

## Development

### Available Commands
```bash
npm run dev          # Start both client & server
npm run dev:client   # Start only client (Vite)
npm run dev:server   # Start only server (Express)
npm run build        # Build both for production
npm run lint         # Run ESLint
npm run format       # Format with Prettier
```

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `PORT` - Server port (default: 3000)
- `CLIENT_URL` - Frontend URL for CORS (default: http://localhost:5173)
- `LOG_LEVEL` - Logging level (default: 'error')

---

## Authentication & User Management

### Core Features
✅ JWT token authentication via Supabase  
✅ Role-based authorization (Admin, Teacher, Student)  
✅ User profile management  
✅ Password reset flow  
✅ Rate limiting on auth endpoints  
✅ Zod validation  

### Authentication Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/auth/signup` | POST | Register new user | No |
| `/api/auth/login` | POST | Login with email/password | No |
| `/api/auth/logout` | POST | Logout | Yes |
| `/api/auth/refresh` | POST | Refresh access token | No |
| `/api/auth/forgot-password` | POST | Request password reset | No |
| `/api/auth/reset-password` | POST | Reset password | Yes |
| `/api/auth/me` | GET | Get current user | Yes |

### User Management Endpoints

| Endpoint | Method | Description | Auth | Roles |
|----------|--------|-------------|------|-------|
| `/api/users/me` | GET | Get my profile | Yes | Any |
| `/api/users/me` | PUT | Update my profile | Yes | Any |
| `/api/users` | GET | List all users | Yes | Admin |
| `/api/users/:id` | GET | Get user by ID | Yes | Admin, Teacher |
| `/api/users/:id/role` | PUT | Update user role | Yes | Admin |
| `/api/users/:id` | DELETE | Delete user | Yes | Admin |

### Error Codes
- `VALIDATION_ERROR` (400) - Invalid input data
- `UNAUTHORIZED` (401) - Missing/invalid token
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `CONFLICT` (409) - Resource conflict
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INTERNAL_ERROR` (500) - Server error

---

## Course Management

### Core Features
✅ Full CRUD operations for courses  
✅ Course status workflow (draft → published → archived)  
✅ Course materials management  
✅ Google Drive integration support  
✅ Pagination and filtering  

### Course Endpoints

| Endpoint | Method | Description | Auth | Roles |
|----------|--------|-------------|------|-------|
| `/api/courses` | POST | Create new course | Yes | Teacher, Admin |
| `/api/courses` | GET | List courses (paginated) | Yes | Any |
| `/api/courses/:id` | GET | Get course by ID | Yes | Any |
| `/api/courses/:id` | PUT | Update course | Yes | Teacher (own), Admin |
| `/api/courses/:id` | DELETE | Delete course | Yes | Teacher (own), Admin |

### Course Materials Endpoints

| Endpoint | Method | Description | Auth | Roles |
|----------|--------|-------------|------|-------|
| `/api/courses/:id/materials` | POST | Add material | Yes | Teacher (own), Admin |
| `/api/courses/:id/materials` | GET | List materials | Yes | Any |
| `/api/courses/materials/:materialId` | DELETE | Delete material | Yes | Teacher (own), Admin |

### Material Types
- `pdf` - PDF documents
- `video` - Video files
- `document` - General documents
- `link` - External links

---

## API Documentation

Interactive Swagger documentation available at: **http://localhost:3000/api-docs**

### Example Usage

**Register:**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepass123",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepass123"
  }'
```

**Access Protected Endpoint:**
```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <access_token>"
```

---

## Security Features

### Infrastructure
- Centralized error handler middleware
- Custom `ApiError` class with error codes
- Request correlation IDs for tracing
- Structured JSON logging with rotation
- Rate limiting (100 req/15min general, 5 req/15min auth)

### Authentication
- JWT token validation
- Secure password hashing via Supabase
- Token refresh support
- Email confirmation support

### Authorization
- Role-based access control
- Self-modification protection
- Proper error responses

### Validation
- Zod schema validation on all inputs
- Email format validation
- Password minimum length (8 characters)
- UUID validation

---

## Testing

**Health check:**
```bash
curl http://localhost:3000/api/health
```

**Database connection test:**
```bash
curl http://localhost:3000/api/db-test
```

---

## Next Steps

Phase 3: Course Management API
- Course CRUD operations
- Course materials management
- Course status workflow (draft → published → archived)
- Teacher assignment to courses

---

## Team Collaboration

- **GitHub Repository**: Add team members as collaborators
- **Project Board**: Use GitHub Projects (Backlog, In Progress, Review, Done)

## License

Private - Team Project
