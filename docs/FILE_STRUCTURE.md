# 📁 MabiniLMS File Structure Guide

## Quick Reference

```
MabiniLMS/
├── 🎨 client/          → Frontend (React + TypeScript + Tailwind)
├── 🖥️  server/          → Backend (Express + TypeScript + Supabase)
├── 📚 docs/            → Documentation (guides, API docs)
└── 🔧 config files     → .eslintrc, .prettierrc, etc.
```

---

## 🎯 Current Structure (Phase 1)

### Frontend - `client/`
```
client/
├── src/
│   ├── components/       # React components
│   │   ├── Login.tsx       [✓ Exists]
│   │   └── Register.tsx    [✓ Exists]
│   │
│   ├── contexts/         # Global state management
│   │   └── AuthContext.tsx [✓ Exists]
│   │
│   ├── lib/              # External library configs
│   │   └── supabase.ts     [✓ Exists]
│   │
│   ├── App.tsx           [✓ Exists] - Main app component
│   ├── main.tsx          [✓ Exists] - Entry point
│   └── index.css         [✓ Exists] - Global styles
│
├── index.html            [✓ Exists]
├── package.json          [✓ Exists]
├── vite.config.ts        [✓ Exists]
└── tailwind.config.js    [✓ Exists]
```

### Backend - `server/`
```
server/
├── src/
│   ├── lib/              # Library configurations
│   │   └── supabase.ts     [✓ Exists]
│   │
│   └── index.ts          [✓ Exists] - Express server
│
├── package.json          [✓ Exists]
└── tsconfig.json         [✓ Exists]
```

---

## 🚀 Organize Structure (Recommended)

Run this command to create organized folders:

```bash
python organize-structure.py
```

This will create:

### Enhanced Client Structure
```
client/src/
├── components/
│   ├── auth/             # Login, Register, ForgotPassword
│   ├── common/           # Button, Input, Modal, Card
│   ├── layout/           # Navbar, Sidebar, Footer
│   ├── courses/          # CourseCard, CourseList, CourseDetail
│   ├── assignments/      # AssignmentList, SubmissionForm
│   └── dashboard/        # StudentDashboard, TeacherDashboard
│
├── contexts/             # Global state
│   └── AuthContext.tsx   [✓ Exists]
│
├── hooks/                # Custom React hooks
│   ├── useAuth.ts
│   ├── useCourses.ts
│   └── useDebounce.ts
│
├── pages/                # Page components
│   ├── Home.tsx
│   ├── Dashboard.tsx
│   ├── CourseList.tsx
│   └── Profile.tsx
│
├── lib/                  # Library configs
│   └── supabase.ts       [✓ Exists]
│
├── types/                # TypeScript types
│   ├── user.ts
│   ├── course.ts
│   └── assignment.ts
│
└── utils/                # Helper functions
    ├── formatDate.ts
    ├── validation.ts
    └── constants.ts
```

### Enhanced Server Structure
```
server/src/
├── controllers/          # Request handlers
│   ├── authController.ts
│   ├── courseController.ts
│   └── assignmentController.ts
│
├── middleware/           # Express middleware
│   ├── auth.ts
│   ├── validation.ts
│   └── errorHandler.ts
│
├── routes/               # API routes
│   ├── authRoutes.ts
│   ├── courseRoutes.ts
│   └── assignmentRoutes.ts
│
├── services/             # Business logic
│   ├── courseService.ts
│   ├── assignmentService.ts
│   └── gradeService.ts
│
├── lib/                  # Library configs
│   └── supabase.ts       [✓ Exists]
│
├── types/                # TypeScript types
│   ├── express.d.ts
│   └── models.ts
│
└── utils/                # Helper functions
    └── validators.ts
```

---

## 📝 Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| **Components** | PascalCase | `LoginForm.tsx`, `CourseCard.tsx` |
| **Hooks** | camelCase + "use" | `useAuth.ts`, `useCourses.ts` |
| **Utils** | camelCase | `formatDate.ts`, `validation.ts` |
| **Types** | PascalCase | `User.ts`, `Course.ts` |
| **Constants** | UPPER_SNAKE | `API_ENDPOINTS.ts` |
| **Folders** | kebab-case | `auth/`, `course-list/` |

---

## 🎨 Component Organization Pattern

### Bad (Don't do this):
```
components/
├── Login.tsx
├── Register.tsx
├── Button.tsx
├── Modal.tsx
├── CourseCard.tsx
├── CourseList.tsx
└── ... (50 more files)
```

### Good (Do this):
```
components/
├── auth/
│   ├── Login.tsx
│   └── Register.tsx
├── common/
│   ├── Button.tsx
│   └── Modal.tsx
└── courses/
    ├── CourseCard.tsx
    └── CourseList.tsx
```

---

## 📂 When to Create New Folders

| Create New Folder When... | Example |
|---------------------------|---------|
| You have 3+ related files | `components/auth/` for login, register, reset |
| Grouping by feature | `components/courses/` for course-related |
| Separating concerns | `lib/` for third-party configs |
| Organizing by type | `types/` for TypeScript interfaces |

---

## 🔍 Quick File Finder

### "Where should I put...?"

| File Type | Location |
|-----------|----------|
| New React component | `client/src/components/{feature}/` |
| Reusable button/input | `client/src/components/common/` |
| Navigation bar | `client/src/components/layout/` |
| Authentication logic | `client/src/contexts/AuthContext.tsx` |
| Custom React hook | `client/src/hooks/` |
| API endpoint handler | `server/src/controllers/` |
| Business logic | `server/src/services/` |
| API route definition | `server/src/routes/` |
| TypeScript interface | `{client|server}/src/types/` |
| Utility function | `{client|server}/src/utils/` |

---

## 📊 File Import Examples

### Clean Imports with Organization

**Before (messy):**
```typescript
import { Login } from '../../components/Login'
import { Register } from '../../components/Register'
import { Button } from '../../components/Button'
```

**After (organized):**
```typescript
import { Login, Register } from '@/components/auth'
import { Button } from '@/components/common'
```

Set up path aliases in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  }
}
```

---

## 🎯 Migration Checklist

If you want to reorganize existing files:

### Client
- [ ] Move `Login.tsx` → `components/auth/Login.tsx`
- [ ] Move `Register.tsx` → `components/auth/Register.tsx`
- [ ] Keep `AuthContext.tsx` in `contexts/` (already good!)
- [ ] Keep `supabase.ts` in `lib/` (already good!)

### Server
- [ ] Keep `supabase.ts` in `lib/` (already good!)
- [ ] When you add routes, put them in `routes/`
- [ ] When you add controllers, put them in `controllers/`

---

## 📚 Additional Resources

For complete details, see:
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Full hierarchy documentation
- **[organize-structure.py](organize-structure.py)** - Script to create folders

---

## 🚀 Quick Actions

```bash
# Create organized structure
python organize-structure.py

# View current structure
tree -L 3 -I "node_modules"

# Navigate to component folder
cd client/src/components

# Navigate to server controllers
cd server/src/controllers
```

---

**Pro Tip**: Start organized from the beginning! It's easier to maintain as your project grows. 🎓
