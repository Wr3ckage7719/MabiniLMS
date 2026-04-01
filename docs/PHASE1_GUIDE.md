# Phase 1: Foundation - Step-by-Step Guide

## Current Status
✅ Project structure created  
✅ Configuration files ready  
🔄 **Next**: Complete setup and build authentication system

---

## 📋 Phase 1 Checklist (Week 1)

### Part A: Setup & Infrastructure (30 minutes)

#### ☐ Step 1: Push to GitHub
```bash
# Run this command:
push-to-github.bat

# Or manually:
git init
git add .
git commit -m "Initial commit: Monorepo setup"
git branch -M main
git remote add origin https://github.com/Wr3ckage7719/MabiniLMS.git
git push -u origin main
```

#### ☐ Step 2: Add Team Members
- Go to: https://github.com/Wr3ckage7719/MabiniLMS/settings/access
- Click "Add people"
- Add each teammate with "Write" access

#### ☐ Step 3: Create Projects Board
- Go to: https://github.com/Wr3ckage7719/MabiniLMS/projects
- Create "Board" project named "MabiniLMS Development"
- Set up columns: Backlog, In Progress, Review, Done

#### ☐ Step 4: Install Dependencies
```bash
npm install
```

#### ☐ Step 5: Test Development Environment
```bash
npm run dev
```
- Verify client runs at http://localhost:5173
- Verify server runs at http://localhost:3000
- Check http://localhost:3000/api/health

---

### Part B: Database Setup (1-2 hours)

#### ☐ Step 6: Install PostgreSQL

**Option A: PostgreSQL Official**
1. Download from: https://www.postgresql.org/download/
2. Install with default settings
3. Remember your password!
4. Default port: 5432

**Option B: Docker (Recommended for teams)**
```bash
docker run --name mabinilms-db -e POSTGRES_PASSWORD=yourpassword -e POSTGRES_DB=mabinilms -p 5432:5432 -d postgres:15
```

#### ☐ Step 7: Create Database
```sql
-- Connect to PostgreSQL (use pgAdmin or psql)
CREATE DATABASE mabinilms;
```

#### ☐ Step 8: Install Database Dependencies
```bash
# In the /server directory
cd server
npm install pg dotenv
npm install --save-dev @types/pg
cd ..
```

#### ☐ Step 9: Configure Environment Variables
```bash
# Copy .env.example to .env
copy .env.example .env

# Edit .env and update:
DB_URL=postgresql://postgres:yourpassword@localhost:5432/mabinilms
JWT_SECRET=your-random-secret-key-min-32-chars-long
PORT=3000
```

#### ☐ Step 10: Create Database Schema

**Create file: `server/src/db/schema.sql`**

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    syllabus TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enrollments table
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'completed')),
    UNIQUE(course_id, student_id)
);

-- Assignments table
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    max_points INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'late')),
    UNIQUE(assignment_id, student_id)
);

-- Grades table
CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    points_earned DECIMAL(5,2),
    feedback TEXT,
    graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Course materials table
CREATE TABLE course_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('pdf', 'video', 'document', 'link')),
    file_url TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_courses_teacher ON courses(teacher_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_assignments_course ON assignments(course_id);
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_grades_submission ON grades(submission_id);
CREATE INDEX idx_materials_course ON course_materials(course_id);
```

#### ☐ Step 11: Create Database Connection Module

**Create file: `server/src/db/connection.ts`**

```typescript
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

export default pool;
```

#### ☐ Step 12: Test Database Connection

**Update `server/src/index.ts`:**

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/connection.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Test database connection endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      message: 'Database connected',
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: (error as Error).message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
```

---

### Part C: Authentication System (3-4 hours)

#### ☐ Step 13: Install Authentication Dependencies
```bash
cd server
npm install bcrypt jsonwebtoken
npm install --save-dev @types/bcrypt @types/jsonwebtoken
cd ..
```

#### ☐ Step 14: Create Auth Utilities

**Create file: `server/src/utils/auth.ts`**

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this';

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const generateToken = (userId: string, email: string, role: string): string => {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};
```

#### ☐ Step 15: Create Auth Middleware

**Create file: `server/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = decoded as any;
  next();
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};
```

#### ☐ Step 16: Create Auth Routes

**Create file: `server/src/routes/auth.ts`**

```typescript
import express from 'express';
import pool from '../db/connection.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, first_name, last_name, role`,
      [email, passwordHash, firstName, lastName, role]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email, user.role);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await comparePassword(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.email, user.role);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
```

#### ☐ Step 17: Update Server with Auth Routes

**Update `server/src/index.ts`:**

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/connection.js';
import authRoutes from './routes/auth.js';
import { authenticate } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Public routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      message: 'Database connected',
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: (error as Error).message 
    });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

// Protected route example
app.get('/api/profile', authenticate, (req: any, res) => {
  res.json({ user: req.user });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
```

---

## ✅ Phase 1 Completion Checklist

- [ ] Code pushed to GitHub
- [ ] Team members added as collaborators
- [ ] Projects board created and configured
- [ ] Dependencies installed successfully
- [ ] Dev environment tested (both client and server run)
- [ ] PostgreSQL installed and running
- [ ] Database created
- [ ] Database schema created
- [ ] Database connection working
- [ ] Auth utilities implemented
- [ ] Auth middleware implemented
- [ ] Register endpoint working
- [ ] Login endpoint working
- [ ] Protected routes working

---

## 🧪 Testing Your Phase 1 Setup

### Test 1: Database Connection
```bash
# Start the server
npm run dev:server

# In another terminal or browser:
curl http://localhost:3000/api/db-test
```
Expected: `{ "status": "ok", "message": "Database connected", ... }`

### Test 2: User Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@test.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "role": "teacher"
  }'
```
Expected: Returns token and user object

### Test 3: User Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@test.com",
    "password": "password123"
  }'
```
Expected: Returns token and user object

### Test 4: Protected Route
```bash
# Use the token from login/register
curl http://localhost:3000/api/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
Expected: Returns user info from token

---

## 🎯 After Phase 1

Once all checkboxes are complete, you'll have:
- ✅ Working development environment
- ✅ Database with complete schema
- ✅ User authentication system
- ✅ JWT-based security
- ✅ Role-based access control foundation

**Next:** Move to Phase 2 (Course Management) where you'll build:
- Course creation/editing UI
- Course listing and search
- Enrollment system
- Course materials upload

---

## 💡 Tips

1. **Work in branches**: Create `feature/database-setup` and `feature/auth-system`
2. **Commit often**: Small, focused commits are better
3. **Test as you go**: Don't wait until the end
4. **Team coordination**: Divide tasks (one person on DB, one on auth, etc.)
5. **Documentation**: Update README with actual setup steps you followed

---

**Ready to start?** Begin with Step 1 (Push to GitHub) and work through sequentially! 🚀
