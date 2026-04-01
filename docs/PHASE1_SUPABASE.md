# Phase 1: Foundation - Supabase Edition

## 🎯 Overview

Using **Supabase** as our backend platform gives us:
- ✅ Hosted PostgreSQL database (no local install needed!)
- ✅ Built-in authentication system
- ✅ Auto-generated REST API
- ✅ Real-time subscriptions
- ✅ File storage
- ✅ Team-friendly (everyone connects to same database)
- ✅ Free tier perfect for development

---

## 📋 Phase 1 Checklist (Week 1)

### Part A: Setup & Infrastructure (30 minutes)

#### ☐ Step 1: Push to GitHub
```bash
push-to-github.bat
```

#### ☐ Step 2: Add Team Members
- Go to: https://github.com/Wr3ckage7719/MabiniLMS/settings/access
- Add teammates with "Write" access

#### ☐ Step 3: Create Projects Board
- Go to: https://github.com/Wr3ckage7719/MabiniLMS/projects
- Create "Board" project: "MabiniLMS Development"
- Columns: Backlog, In Progress, Review, Done

#### ☐ Step 4: Install Dependencies
```bash
npm install
```

#### ☐ Step 5: Test Development Environment
```bash
npm run dev
```
- Client: http://localhost:5173
- Server: http://localhost:3000

---

### Part B: Supabase Setup (45 minutes)

#### ☐ Step 6: Create Supabase Account
1. Go to: https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub (recommended)

#### ☐ Step 7: Create New Supabase Project
1. Click "New Project"
2. **Organization**: Create "MabiniLMS" (or use existing)
3. **Project Name**: MabiniLMS
4. **Database Password**: Choose a strong password (save it!)
5. **Region**: Choose closest to your team
6. Click "Create new project" (takes ~2 minutes)

#### ☐ Step 8: Get Supabase Credentials
1. Go to Project Settings → API
2. Copy these values:
   - **Project URL** (e.g., https://xxxxx.supabase.co)
   - **anon public** key
   - **service_role** key (keep secret!)

#### ☐ Step 9: Configure Environment Variables

**Create `.env` file in root:**
```bash
# Copy from .env.example
copy .env.example .env
```

**Update `.env` with your Supabase credentials:**
```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Server
PORT=3000

# Client (for Vite)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Create `.env` file in client folder:**
```bash
cd client
echo VITE_SUPABASE_URL=https://your-project-id.supabase.co > .env
echo VITE_SUPABASE_ANON_KEY=your-anon-key-here >> .env
cd ..
```

#### ☐ Step 10: Create Database Schema in Supabase

1. Go to Supabase Dashboard → **SQL Editor**
2. Click "New Query"
3. Paste this schema and click "Run":

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    syllabus TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enrollments table
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'completed')),
    UNIQUE(course_id, student_id)
);

-- Assignments table
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    max_points INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE public.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'late')),
    UNIQUE(assignment_id, student_id)
);

-- Grades table
CREATE TABLE public.grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    points_earned DECIMAL(5,2),
    feedback TEXT,
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Course materials table
CREATE TABLE public.course_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('pdf', 'video', 'document', 'link')),
    file_url TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_courses_teacher ON public.courses(teacher_id);
CREATE INDEX idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX idx_assignments_course ON public.assignments(course_id);
CREATE INDEX idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX idx_submissions_student ON public.submissions(student_id);
CREATE INDEX idx_grades_submission ON public.grades(submission_id);
CREATE INDEX idx_materials_course ON public.course_materials(course_id);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for courses
CREATE POLICY "Anyone can view published courses" ON public.courses
    FOR SELECT USING (status = 'published' OR teacher_id = auth.uid());

CREATE POLICY "Teachers can create courses" ON public.courses
    FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own courses" ON public.courses
    FOR UPDATE USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own courses" ON public.courses
    FOR DELETE USING (teacher_id = auth.uid());

-- RLS Policies for enrollments
CREATE POLICY "Users can view own enrollments" ON public.enrollments
    FOR SELECT USING (student_id = auth.uid() OR 
        course_id IN (SELECT id FROM public.courses WHERE teacher_id = auth.uid()));

CREATE POLICY "Students can enroll in courses" ON public.enrollments
    FOR INSERT WITH CHECK (student_id = auth.uid());

-- RLS Policies for assignments
CREATE POLICY "Enrolled users can view assignments" ON public.assignments
    FOR SELECT USING (
        course_id IN (
            SELECT course_id FROM public.enrollments WHERE student_id = auth.uid()
        ) OR 
        course_id IN (
            SELECT id FROM public.courses WHERE teacher_id = auth.uid()
        )
    );

CREATE POLICY "Teachers can manage assignments" ON public.assignments
    FOR ALL USING (
        course_id IN (SELECT id FROM public.courses WHERE teacher_id = auth.uid())
    );

-- RLS Policies for submissions
CREATE POLICY "Users can view own submissions" ON public.submissions
    FOR SELECT USING (
        student_id = auth.uid() OR
        assignment_id IN (
            SELECT id FROM public.assignments WHERE course_id IN (
                SELECT id FROM public.courses WHERE teacher_id = auth.uid()
            )
        )
    );

CREATE POLICY "Students can submit assignments" ON public.submissions
    FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own submissions" ON public.submissions
    FOR UPDATE USING (student_id = auth.uid());
```

4. Click "Run" and verify "Success. No rows returned"

#### ☐ Step 11: Enable Email Authentication

1. Go to **Authentication** → **Providers**
2. **Email** should be enabled by default
3. Under **Email Templates**, customize if desired
4. Under **URL Configuration**, set:
   - Site URL: `http://localhost:5173` (for development)

#### ☐ Step 12: Invite Team to Supabase (Optional)

1. Go to **Project Settings** → **Team**
2. Invite team members with "Developer" role
3. They can view database and help with schema

---

### Part C: Install Supabase Client Libraries (15 minutes)

#### ☐ Step 13: Install Supabase in Server

```bash
cd server
npm install @supabase/supabase-js
cd ..
```

#### ☐ Step 14: Install Supabase in Client

```bash
cd client
npm install @supabase/supabase-js
cd ..
```

#### ☐ Step 15: Create Supabase Client for Server

**Create file: `server/src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// Server-side client with service role (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Client with anon key (respects RLS)
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('✅ Supabase clients initialized');
```

#### ☐ Step 16: Create Supabase Client for Frontend

**Create file: `client/src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

### Part D: Authentication with Supabase (1-2 hours)

#### ☐ Step 17: Create Auth Context in Client

**Create file: `client/src/contexts/AuthContext.tsx`**

```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'teacher' | 'student';
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, profile: Omit<Profile, 'id' | 'email'>) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string, 
    password: string, 
    profileData: Omit<Profile, 'id' | 'email'>
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: data.user.email!,
          ...profileData,
        });

      if (profileError) throw profileError;
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      session, 
      loading, 
      signUp, 
      signIn, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

#### ☐ Step 18: Create Login Component

**Create file: `client/src/components/Login.tsx`**

```typescript
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Login to MabiniLMS</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

#### ☐ Step 19: Create Register Component

**Create file: `client/src/components/Register.tsx`**

```typescript
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        role,
      });
      alert('Registration successful! Please check your email to verify your account.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Register for MabiniLMS</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

#### ☐ Step 20: Update App.tsx to Use Auth

**Update file: `client/src/App.tsx`**

```typescript
import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Register from './components/Register';

function AuthContent() {
  const { user, profile, loading, signOut } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return showRegister ? (
      <div>
        <Register />
        <div className="text-center mt-4">
          <button
            onClick={() => setShowRegister(false)}
            className="text-blue-600 hover:underline"
          >
            Already have an account? Login
          </button>
        </div>
      </div>
    ) : (
      <div>
        <Login />
        <div className="text-center mt-4">
          <button
            onClick={() => setShowRegister(true)}
            className="text-blue-600 hover:underline"
          >
            Don't have an account? Register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">MabiniLMS Dashboard</h1>
            <button
              onClick={signOut}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <span className="font-semibold">Name:</span>{' '}
              {profile?.first_name} {profile?.last_name}
            </div>
            <div>
              <span className="font-semibold">Email:</span> {profile?.email}
            </div>
            <div>
              <span className="font-semibold">Role:</span>{' '}
              <span className="capitalize px-3 py-1 bg-blue-100 text-blue-800 rounded">
                {profile?.role}
              </span>
            </div>
          </div>

          <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded">
            <p className="text-green-800">
              ✅ Authentication is working! You're logged in with Supabase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthContent />
    </AuthProvider>
  );
}

export default App;
```

#### ☐ Step 21: Update Server with Supabase

**Update file: `server/src/index.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase, supabaseAdmin } from './lib/supabase.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Test Supabase connection
app.get('/api/db-test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) throw error;

    res.json({ 
      status: 'ok', 
      message: 'Supabase connected successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Supabase connection failed',
      error: (error as Error).message 
    });
  }
});

// Example: Get all courses
app.get('/api/courses', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('status', 'published');

    if (error) throw error;

    res.json({ courses: data });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
```

---

## ✅ Phase 1 Completion Checklist

### Setup
- [ ] Code pushed to GitHub
- [ ] Team members added as collaborators
- [ ] Projects board created
- [ ] Dependencies installed
- [ ] Dev environment tested

### Supabase
- [ ] Supabase account created
- [ ] Project created
- [ ] Database schema created
- [ ] Email auth enabled
- [ ] Environment variables configured
- [ ] Supabase clients installed and configured

### Authentication
- [ ] Auth context created
- [ ] Login component working
- [ ] Register component working
- [ ] Protected routes working
- [ ] User can sign up, login, logout

---

## 🧪 Testing Phase 1

### Test 1: Database Connection
```bash
npm run dev:server
# Visit: http://localhost:3000/api/db-test
```
Expected: `{ "status": "ok", "message": "Supabase connected successfully" }`

### Test 2: User Registration
```bash
npm run dev
# Visit: http://localhost:5173
# Click "Register"
# Fill out form and submit
```
Expected: Success message, check email for verification

### Test 3: User Login
```bash
# After registering, login with credentials
```
Expected: See dashboard with user info

### Test 4: Supabase Dashboard
1. Go to Supabase Dashboard → Table Editor
2. Click on "profiles" table
3. Should see your registered user

---

## 🎯 Advantages of Using Supabase

✅ **No local PostgreSQL installation**  
✅ **Built-in authentication** (email, OAuth, etc.)  
✅ **Auto-generated REST API**  
✅ **Real-time subscriptions** (for live updates)  
✅ **Row Level Security** (built-in permission system)  
✅ **File storage** (for course materials, avatars)  
✅ **Team collaboration** (shared database)  
✅ **Free tier** (500MB database, 50MB file storage)  
✅ **Automatic backups**  
✅ **Easy to scale**

---

## 📚 Supabase Resources

- **Docs**: https://supabase.com/docs
- **Dashboard**: https://app.supabase.com
- **Auth Guide**: https://supabase.com/docs/guides/auth
- **Database Guide**: https://supabase.com/docs/guides/database
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security

---

## 🚀 After Phase 1

You'll have:
- ✅ Working development environment
- ✅ Supabase database with complete schema
- ✅ User authentication (register, login, logout)
- ✅ Role-based user system (admin, teacher, student)
- ✅ Foundation for building features

**Next:** Phase 2 - Course Management! 🎓

---

**Ready to start?** Begin with Step 1 and work through sequentially! 🚀
