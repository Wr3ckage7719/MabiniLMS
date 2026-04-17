# Database Setup Guide

## Overview

MabiniLMS uses PostgreSQL via Supabase for data storage. This guide walks you through database setup.

---

## ✅ Database Status

Your database should have these **11 tables**:

### Core Tables
1. `profiles` - User accounts (extends Supabase auth.users)
2. `courses` - Course information
3. `enrollments` - Student course enrollments
4. `assignments` - Assignment definitions
5. `submissions` - Student assignment submissions
6. `grades` - Grading data
7. `course_materials` - Course materials and files
8. `google_tokens` - Google OAuth refresh tokens

### Feature Tables
9. `email_verification_tokens` - Email verification system
10. `password_reset_tokens` - Password reset system
11. `notifications` - In-app notifications

---

## 🚀 Setup Instructions

### Option 1: Using Supabase Dashboard (Recommended)

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your project URL and API keys

2. **Run Database Schema**
   - Open Supabase Dashboard
   - Navigate to SQL Editor
   - Copy content from `database-schema-complete.sql`
   - Paste and run

3. **Add Missing Features**
   - In SQL Editor, run `ADD_MISSING_FEATURES.sql`
   - This adds email verification and notifications tables

4. **Verify Setup**
   ```sql
   -- Run this to check all tables exist
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
     AND table_type = 'BASE TABLE'
   ORDER BY table_name;
   ```
   You should see all 11 tables listed.

---

### Option 2: Using Migration Files

If you prefer the migration approach:

1. **Run migrations in order:**
   ```bash
   # In Supabase SQL Editor, run each file:
   server/migrations/000_migrations_system.sql
   server/migrations/001_initial_schema.sql
   server/migrations/002_email_verification.sql
   server/migrations/003_notifications.sql
   ```

2. **Track applied migrations:**
   ```sql
   SELECT * FROM public.schema_migrations ORDER BY version;
   ```

---

## 🔑 Get Your Credentials

After creating your Supabase project:

1. **Project Settings → API**
   - `SUPABASE_URL`: Project URL
   - `SUPABASE_ANON_KEY`: `anon` `public` key
   - `SUPABASE_SERVICE_KEY`: `service_role` `secret` key

2. **Add to `.env`:**
   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

---

## 🔍 Verify Database Setup

### Check Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

### Check Row Level Security
```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Test Authentication Trigger
```sql
-- This trigger auto-creates profiles when users sign up
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'handle_new_user';
```

---

## 📊 Database Schema Overview

### Core Relationships

```
auth.users (Supabase)
    ↓
profiles (1:1)
    ↓
    ├── courses (1:many) ← teacher_id
    │       ↓
    │       ├── enrollments (many:many with profiles)
    │       ├── assignments (1:many)
    │       └── course_materials (1:many)
    │
    ├── enrollments (many:many) ← student_id
    ├── submissions (1:many) ← student_id
    │       ↓
    │       └── grades (1:1)
    │
    ├── notifications (1:many)
    └── google_tokens (1:1)
```

### Key Features

**Row Level Security (RLS):**
- All tables have RLS enabled
- Policies enforce role-based access
- Students see only their data
- Teachers see their course data
- Admins have full access

**Indexes:**
- Foreign keys indexed
- Common query patterns optimized
- Email lookups optimized

**Triggers:**
- Auto-create profile on user signup
- Updated timestamps on modifications

---

## 🛠️ Common Operations

### Add a Test User
```sql
-- Via Supabase Auth (preferred method)
-- Use Supabase Dashboard → Authentication → Add User

-- Profile will be auto-created via trigger
```

### Check User Roles
```sql
SELECT id, email, role, first_name, last_name
FROM public.profiles
ORDER BY created_at DESC
LIMIT 10;
```

### View Course Enrollments
```sql
SELECT 
  c.title AS course,
  p.email AS student,
  e.status,
  e.enrolled_at
FROM enrollments e
JOIN courses c ON e.course_id = c.id
JOIN profiles p ON e.student_id = p.id
ORDER BY e.enrolled_at DESC
LIMIT 20;
```

---

## ⚠️ Troubleshooting

### "relation already exists"
**Cause:** Table already created  
**Solution:** This is fine! The schema uses `IF NOT EXISTS`

### "permission denied"
**Cause:** Using wrong API key  
**Solution:** Use service role key for admin operations

### Foreign key errors
**Cause:** Running scripts out of order  
**Solution:** Run `database-schema-complete.sql` first, then `ADD_MISSING_FEATURES.sql`

### No profiles created on signup
**Cause:** Trigger not working  
**Solution:** Check trigger exists:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

---

## 🔄 Migration Management

The `server/migrations/` folder contains versioned schema changes:

- `000_migrations_system.sql` - Migration tracking table
- `001_initial_schema.sql` - Core tables
- `002_email_verification.sql` - Email features
- `003_notifications.sql` - Notification system

See `server/migrations/README.md` for migration documentation.

---

## 📈 Next Steps

After database setup:

1. ✅ Verify all 11 tables exist
2. ✅ Test authentication via API
3. ✅ Create test courses and enrollments
4. ✅ Verify RLS policies work
5. ✅ Check trigger auto-creates profiles

---

## 📝 Backup & Restore

### Backup Database
```bash
# Via Supabase Dashboard
# Settings → Database → Database Backups
# Or use pg_dump if you have direct access
```

### Restore from Backup
```bash
# Via Supabase Dashboard
# Settings → Database → Restore
```

---

## 🔗 Related Documentation

- [API Documentation](../DOCUMENTATION.md)
- [Migration Guide](../server/migrations/README.md)
- [Frontend Integration](../FRONTEND_INTEGRATION_GUIDE.md)

---

**Need Help?** Check [DATABASE_STATUS.md](../DATABASE_STATUS.md) for current status and troubleshooting.
