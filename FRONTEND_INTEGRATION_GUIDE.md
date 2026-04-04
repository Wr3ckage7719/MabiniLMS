# Merging Your React/Vite/Tailwind UI with MabiniLMS Backend

## Current Project Structure

```
MabiniLMS/
├── server/          # Backend (Node.js/Express/TypeScript) ✅ Complete
├── client/          # Frontend (empty or minimal)
├── docs/
└── database-schema-complete.sql
```

## Integration Options

### Option 1: Replace Existing Client Folder (Recommended)

If you want to completely replace the current client folder:

```bash
# 1. Backup existing client folder (if needed)
cd D:\MabiniLMS
Move-Item client client_backup -ErrorAction SilentlyContinue

# 2. Copy your UI project
Copy-Item -Recurse "PATH_TO_YOUR_UI_PROJECT\*" client\

# 3. Update package.json scripts (see below)
```

### Option 2: Merge Into Existing Client

If you want to merge files:

```bash
# Copy your files into the client folder
Copy-Item -Recurse "PATH_TO_YOUR_UI_PROJECT\*" client\ -Force

# Resolve any conflicts manually
```

---

## Required Configuration Updates

### 1. Frontend Environment Variables

Create `client/.env`:

```env
# API Configuration
VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 2. Vite Configuration

Update `client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

### 3. Update Root Package.json

Add concurrently scripts to run both frontend and backend:

```json
{
  "name": "mabinilms",
  "version": "1.0.0",
  "scripts": {
    "dev": "concurrently \"npm run server:dev\" \"npm run client:dev\"",
    "server:dev": "cd server && npm run dev",
    "client:dev": "cd client && npm run dev",
    "build": "npm run server:build && npm run client:build",
    "server:build": "cd server && npm run build",
    "client:build": "cd client && npm run build",
    "test": "cd server && npm test",
    "install:all": "npm install && cd server && npm install && cd ../client && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

Install concurrently:

```bash
npm install -D concurrently
```

### 4. TypeScript Configuration (if needed)

Ensure `client/tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## API Integration Examples

### 1. API Client Setup

Create `client/src/lib/api.ts`:

```typescript
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Create axios instance
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
```

### 2. Authentication Hook

Create `client/src/hooks/useAuth.ts`:

```typescript
import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface User {
  id: string
  email: string
  role: 'admin' | 'teacher' | 'student'
  first_name: string
  last_name: string
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        setLoading(false)
        return
      }

      const { data } = await api.get('/auth/me')
      setUser(data.data)
    } catch (error) {
      localStorage.removeItem('access_token')
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('access_token', data.data.access_token)
    setUser(data.data.user)
    return data.data
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      localStorage.removeItem('access_token')
      setUser(null)
      window.location.href = '/login'
    }
  }

  return { user, loading, login, logout, checkAuth }
}
```

### 3. API Service Examples

Create `client/src/services/`:

**courses.service.ts:**
```typescript
import api from '@/lib/api'

export const coursesService = {
  getAll: async (page = 1, limit = 10) => {
    const { data } = await api.get('/courses', { params: { page, limit } })
    return data
  },

  getById: async (id: string) => {
    const { data } = await api.get(`/courses/${id}`)
    return data
  },

  create: async (courseData: any) => {
    const { data } = await api.post('/courses', courseData)
    return data
  },

  update: async (id: string, courseData: any) => {
    const { data } = await api.put(`/courses/${id}`, courseData)
    return data
  },

  delete: async (id: string) => {
    const { data } = await api.delete(`/courses/${id}`)
    return data
  },
}
```

**grades.service.ts:**
```typescript
import api from '@/lib/api'

export const gradesService = {
  getAssignmentGrades: async (assignmentId: string) => {
    const { data } = await api.get(`/grades/assignment/${assignmentId}`)
    return data
  },

  getStats: async (assignmentId: string) => {
    const { data } = await api.get(`/grades/assignment/${assignmentId}/stats`)
    return data
  },

  createGrade: async (gradeData: any) => {
    const { data } = await api.post('/grades', gradeData)
    return data
  },

  bulkGrade: async (grades: any[]) => {
    const { data } = await api.post('/grades/bulk', { grades })
    return data
  },
}
```

**search.service.ts:**
```typescript
import api from '@/lib/api'

export const searchService = {
  global: async (query: string, types?: string[], limit = 10) => {
    const { data } = await api.get('/search', {
      params: { q: query, types: types?.join(','), limit },
    })
    return data
  },

  courses: async (query: string, page = 1) => {
    const { data } = await api.get('/search/courses', {
      params: { q: query, page },
    })
    return data
  },
}
```

**notifications.service.ts:**
```typescript
import api from '@/lib/api'

export const notificationsService = {
  getAll: async (read?: 'true' | 'false' | 'all') => {
    const { data } = await api.get('/notifications', { params: { read } })
    return data
  },

  getCount: async () => {
    const { data } = await api.get('/notifications/count')
    return data
  },

  markAsRead: async (id: string) => {
    const { data } = await api.patch(`/notifications/${id}/read`)
    return data
  },

  markAllAsRead: async () => {
    const { data } = await api.post('/notifications/mark-all-read')
    return data
  },

  delete: async (id: string) => {
    const { data } = await api.delete(`/notifications/${id}`)
    return data
  },
}
```

---

## Recommended Folder Structure

```
client/
├── public/
│   └── vite.svg
├── src/
│   ├── assets/          # Images, fonts, etc.
│   ├── components/      # Reusable UI components
│   │   ├── common/      # Buttons, inputs, cards, etc.
│   │   ├── layout/      # Header, sidebar, footer
│   │   └── features/    # Feature-specific components
│   ├── hooks/           # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useCourses.ts
│   │   └── useNotifications.ts
│   ├── lib/             # Utilities and configs
│   │   ├── api.ts       # Axios instance
│   │   └── utils.ts     # Helper functions
│   ├── pages/           # Page components
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Courses.tsx
│   │   ├── Assignments.tsx
│   │   └── Grades.tsx
│   ├── services/        # API services
│   │   ├── auth.service.ts
│   │   ├── courses.service.ts
│   │   ├── grades.service.ts
│   │   └── notifications.service.ts
│   ├── types/           # TypeScript types
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## Step-by-Step Integration Guide

### Step 1: Copy Your UI Project
```bash
# From PowerShell in MabiniLMS directory
$UI_PATH = "PATH_TO_YOUR_UI_PROJECT"  # Replace with your actual path
Copy-Item -Recurse "$UI_PATH\*" client\ -Force
```

### Step 2: Install Dependencies
```bash
cd client
npm install
```

### Step 3: Configure Environment
```bash
# Copy example env and fill in values
Copy-Item .env.example .env
# Edit .env with your values
```

### Step 4: Update API calls
- Replace any hardcoded API URLs with the proxy or env variable
- Ensure all API calls use the `/api` prefix

### Step 5: Test Integration
```bash
# From root directory
npm run dev  # Runs both server and client

# Or separately:
npm run server:dev  # Terminal 1
npm run client:dev  # Terminal 2
```

---

## CORS Configuration (Already Set Up)

The server already has CORS enabled in `server/src/index.ts`:

```typescript
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
```

Make sure `CLIENT_URL` in `server/.env` matches your frontend URL:
```env
CLIENT_URL=http://localhost:5173
```

---

## Example React Components

### Login Page
```typescript
// client/src/pages/Login.tsx
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <h2 className="text-3xl font-bold text-center">Sign in to MabiniLMS</h2>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <input
            type="email"
            required
            className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
```

---

## Troubleshooting

### Issue: API calls failing with 404
**Solution:** Ensure Vite proxy is configured and server is running on port 3000

### Issue: CORS errors
**Solution:** Check `CLIENT_URL` in server `.env` matches your frontend URL

### Issue: TypeScript errors
**Solution:** Ensure `client/tsconfig.json` is properly configured for React + Vite

### Issue: Tailwind not working
**Solution:** Check `tailwind.config.js` and ensure `@tailwindcss` directives are in `index.css`

---

## Next Steps After Integration

1. ✅ Test all API endpoints from UI
2. ✅ Add loading states and error handling
3. ✅ Implement protected routes (require auth)
4. ✅ Add notification polling or WebSocket
5. ✅ Build production version
6. ✅ Deploy frontend and backend

---

## Production Build

```bash
# Build both
npm run build

# Server output: server/dist/
# Client output: client/dist/

# Deploy server to Node.js hosting (Railway, Render, etc.)
# Deploy client to static hosting (Vercel, Netlify, etc.)
```

---

## Questions to Answer

Before merging, please confirm:

1. **Where is your UI project located?** (full path)
2. **Do you want to replace the current client folder or merge?**
3. **Does your UI already have API integration, or do I need to add it?**
4. **What features/pages does your UI include?**

Let me know and I'll help you complete the integration! 🚀
