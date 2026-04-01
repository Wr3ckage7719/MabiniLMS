# MabiniLMS - Project Structure

## 📁 Complete File Hierarchy

```
MabiniLMS/                              # Root directory
│
├── 📂 client/                          # Frontend React Application
│   ├── 📂 node_modules/                # Client dependencies (auto-generated)
│   ├── 📂 src/                         # Source code
│   │   ├── 📂 components/              # Reusable React components
│   │   │   ├── Login.tsx               # Login form component
│   │   │   └── Register.tsx            # Registration form component
│   │   │
│   │   ├── 📂 contexts/                # React Context providers
│   │   │   └── AuthContext.tsx         # Authentication context & hooks
│   │   │
│   │   ├── 📂 lib/                     # Library configurations
│   │   │   └── supabase.ts             # Supabase client initialization
│   │   │
│   │   ├── App.tsx                     # Main application component
│   │   ├── main.tsx                    # Application entry point
│   │   ├── index.css                   # Global styles with Tailwind
│   │   └── vite-env.d.ts               # TypeScript declarations for Vite
│   │
│   ├── .env                            # Environment variables (ignored by git)
│   ├── index.html                      # HTML entry point
│   ├── package.json                    # Client dependencies & scripts
│   ├── postcss.config.js               # PostCSS configuration
│   ├── tailwind.config.js              # Tailwind CSS configuration
│   ├── tsconfig.json                   # TypeScript configuration
│   ├── tsconfig.node.json              # TypeScript config for Node scripts
│   └── vite.config.ts                  # Vite build configuration
│
├── 📂 server/                          # Backend Express API
│   ├── 📂 node_modules/                # Server dependencies (auto-generated)
│   ├── 📂 src/                         # Source code
│   │   ├── 📂 lib/                     # Library configurations
│   │   │   └── supabase.ts             # Supabase admin client
│   │   │
│   │   └── index.ts                    # Express server entry point
│   │
│   ├── .env                            # Server environment variables (ignored by git)
│   ├── package.json                    # Server dependencies & scripts
│   └── tsconfig.json                   # TypeScript configuration
│
├── 📂 node_modules/                    # Root workspace dependencies (auto-generated)
│
├── 📂 .git/                            # Git repository data
│
├── 📄 .editorconfig                    # Editor configuration for consistent coding style
├── 📄 .env                             # Root environment variables (ignored by git)
├── 📄 .env.example                     # Example environment variables template
├── 📄 .eslintrc.json                   # ESLint configuration (code linting)
├── 📄 .gitignore                       # Files/folders ignored by Git
├── 📄 .prettierrc.json                 # Prettier configuration (code formatting)
│
├── 📄 database-schema.sql              # Database schema for Supabase
├── 📄 package.json                     # Root workspace configuration
├── 📄 package-lock.json                # Dependency lock file (auto-generated)
│
├── 📚 Documentation Files:
│   ├── README.md                       # Main project documentation
│   ├── QUICKSTART.md                   # Quick start guide
│   ├── SETUP.md                        # Detailed setup instructions
│   ├── GITHUB_SETUP.md                 # GitHub configuration guide
│   ├── SUPABASE_QUICKSTART.md          # Supabase quick reference
│   ├── PHASE1_SUPABASE.md              # Phase 1 Supabase implementation guide
│   ├── PHASE1_COMPLETE.md              # Phase 1 completion summary
│   ├── PHASE1_GUIDE.md                 # Phase 1 step-by-step guide
│   ├── NEXT_STEPS.md                   # Development roadmap
│   └── CURRENT_STATUS.md               # Current project status
│
└── 🔧 Setup Scripts:
    ├── setup.py                        # Python setup script
    ├── setup.bat                       # Windows batch setup script
    ├── setup.ps1                       # PowerShell setup script
    ├── setup-supabase-files.py         # Supabase file generator
    └── push-to-github.bat              # Git push automation script
```

---

## 📋 Directory Purposes

### 🎨 **client/** - Frontend Application
**Purpose**: User interface built with React, TypeScript, and Tailwind CSS

**Key Subdirectories**:
- `src/components/` - Reusable UI components (buttons, forms, cards, etc.)
- `src/contexts/` - React Context for global state management
- `src/lib/` - Third-party library configurations

**Main Files**:
- `App.tsx` - Root component with routing and authentication logic
- `main.tsx` - React application bootstrap
- `vite.config.ts` - Build tool configuration with PWA plugin

---

### 🖥️ **server/** - Backend API
**Purpose**: RESTful API server built with Express and TypeScript

**Key Subdirectories**:
- `src/lib/` - Supabase client and shared utilities

**Main Files**:
- `index.ts` - Express server setup with routes and middleware

**Future Structure** (as you build features):
```
server/src/
├── controllers/    # Request handlers
├── middleware/     # Auth, validation, error handling
├── routes/         # API route definitions
├── services/       # Business logic
└── types/          # TypeScript type definitions
```

---

### 📚 **Documentation Files**

| File | Purpose |
|------|---------|
| `README.md` | Project overview, tech stack, basic usage |
| `QUICKSTART.md` | Fast track to get started |
| `SETUP.md` | Detailed setup instructions |
| `GITHUB_SETUP.md` | How to configure GitHub repo and team |
| `SUPABASE_QUICKSTART.md` | Supabase setup reference |
| `PHASE1_SUPABASE.md` | Phase 1 implementation guide |
| `PHASE1_COMPLETE.md` | What was accomplished in Phase 1 |
| `NEXT_STEPS.md` | Development roadmap and next features |
| `CURRENT_STATUS.md` | Current project state |

---

### 🔧 **Configuration Files**

| File | Purpose |
|------|---------|
| `.editorconfig` | Ensures consistent coding style across editors |
| `.eslintrc.json` | JavaScript/TypeScript linting rules |
| `.prettierrc.json` | Code formatting rules |
| `.gitignore` | Files to exclude from version control |
| `.env` | Environment variables (secrets, API keys) |
| `.env.example` | Template for environment variables |

---

### 📦 **Package Files**

| File | Location | Purpose |
|------|----------|---------|
| `package.json` | Root | Workspace configuration, shared scripts |
| `package.json` | client/ | Frontend dependencies (React, Vite, Tailwind) |
| `package.json` | server/ | Backend dependencies (Express, Supabase) |
| `package-lock.json` | Root | Locks dependency versions |

---

## 🗂️ Recommended Folder Expansion (Phase 2+)

As you build more features, expand the structure:

### **Client Structure**:
```
client/src/
├── components/
│   ├── common/           # Shared components (Button, Input, Modal)
│   ├── layout/           # Layout components (Navbar, Sidebar, Footer)
│   ├── auth/             # Authentication components (Login, Register)
│   ├── courses/          # Course-related components
│   ├── assignments/      # Assignment components
│   └── dashboard/        # Dashboard components
│
├── contexts/
│   ├── AuthContext.tsx   # ✅ Already exists
│   ├── CourseContext.tsx # Future: Course state management
│   └── ThemeContext.tsx  # Future: Dark mode, theming
│
├── hooks/                # Custom React hooks
│   ├── useAuth.ts        # Authentication hook
│   ├── useCourses.ts     # Course data fetching
│   └── useDebounce.ts    # Utility hooks
│
├── pages/                # Page components
│   ├── Home.tsx
│   ├── Dashboard.tsx
│   ├── CourseList.tsx
│   ├── CourseDetail.tsx
│   └── Profile.tsx
│
├── lib/
│   ├── supabase.ts       # ✅ Already exists
│   └── api.ts            # API helper functions
│
├── types/                # TypeScript interfaces
│   ├── user.ts
│   ├── course.ts
│   └── assignment.ts
│
└── utils/                # Utility functions
    ├── formatDate.ts
    ├── validation.ts
    └── constants.ts
```

### **Server Structure**:
```
server/src/
├── controllers/          # Request handlers
│   ├── authController.ts
│   ├── courseController.ts
│   └── assignmentController.ts
│
├── middleware/
│   ├── auth.ts           # Authentication middleware
│   ├── validation.ts     # Request validation
│   └── errorHandler.ts   # Error handling
│
├── routes/
│   ├── authRoutes.ts
│   ├── courseRoutes.ts
│   └── assignmentRoutes.ts
│
├── services/             # Business logic
│   ├── courseService.ts
│   └── gradeService.ts
│
├── lib/
│   ├── supabase.ts       # ✅ Already exists
│   └── storage.ts        # File storage helpers
│
└── types/                # TypeScript interfaces
    ├── express.d.ts      # Express type extensions
    └── models.ts         # Data models
```

---

## 🎯 Best Practices

### ✅ DO:
- Keep components small and focused (single responsibility)
- Group related files in dedicated folders
- Use index files for cleaner imports
- Separate business logic from UI components
- Use TypeScript interfaces for type safety

### ❌ DON'T:
- Put all components in one folder
- Mix server and client code
- Commit `.env` files to Git
- Store business logic in components
- Create deeply nested folder structures (max 3-4 levels)

---

## 📝 File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| React Components | PascalCase | `LoginForm.tsx` |
| Hooks | camelCase with "use" prefix | `useAuth.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Types/Interfaces | PascalCase | `User.ts`, `Course.ts` |
| Constants | UPPER_SNAKE_CASE | `API_ENDPOINTS.ts` |
| Config files | kebab-case | `eslint.config.js` |

---

## 🚀 Quick Navigation

### Working on Frontend?
```bash
cd client
npm run dev
```
**Files you'll edit**: `client/src/`

### Working on Backend?
```bash
cd server
npm run dev
```
**Files you'll edit**: `server/src/`

### Working on Database?
**Go to**: Supabase Dashboard SQL Editor
**Reference**: `database-schema.sql`

### Need to Install Packages?
```bash
# Root (workspace)
npm install

# Client only
cd client && npm install

# Server only
cd server && npm install
```

---

## 🔍 Find Files Quickly

| Looking for... | Location |
|----------------|----------|
| Login/Register forms | `client/src/components/` |
| Authentication logic | `client/src/contexts/AuthContext.tsx` |
| Supabase config | `client/src/lib/supabase.ts` |
| API endpoints | `server/src/index.ts` |
| Database schema | `database-schema.sql` |
| Environment variables | `.env` files |
| Styling | `client/src/index.css` |
| Project docs | Root `*.md` files |

---

**Need to understand a specific part?** Just ask! 🎓
