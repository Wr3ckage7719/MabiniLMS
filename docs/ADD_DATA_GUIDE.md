# 🗄️ Adding Real Data to Your System

Your frontend now fetches from the real API! But your Supabase database is probably empty. Here's how to populate it with data.

---

## 🎯 Quick Start: Add Data via Supabase Dashboard

### Step 1: Access Supabase Dashboard

1. Go to: https://bwzqqifuwqpzfvauwgqq.supabase.co
2. Login with your Supabase account
3. Click "Table Editor" in left sidebar

### Step 2: Create a Test Course

**Table**: `courses`

Click "Insert row" and add:
```
title: "Introduction to Computer Science"
description: "Learn programming fundamentals"
teacher_id: [your-user-id-here]
status: "active"
created_at: [auto-filled]
updated_at: [auto-filled]
```

**Copy the course ID** after creation (you'll need it)

### Step 3: Enroll Yourself

**Table**: `enrollments`

Click "Insert row" and add:
```
course_id: [course-id-from-step-2]
student_id: [your-user-id-here]
role: "student"
enrolled_at: [current date/time]
```

### Step 4: Add an Assignment

**Table**: `assignments`

Click "Insert row" and add:
```
course_id: [course-id-from-step-2]
title: "Homework 1: Variables and Data Types"
description: "Complete exercises 1-10 from textbook"
due_date: "2026-04-15"
max_points: 100
status: "published"
type: "assignment"
created_at: [auto-filled]
```

### Step 5: Add a Grade (Optional)

**Table**: `grades`

Click "Insert row" and add:
```
assignment_id: [assignment-id-from-step-4]
student_id: [your-user-id-here]
points: 85
max_points: 100
submitted_at: [current date/time]
graded_at: [current date/time]
status: "graded"
```

### Step 6: Test!

1. Refresh your browser: http://localhost:8080/dashboard
2. Should see "Introduction to Computer Science" course
3. Click on it → Should see "Homework 1" assignment
4. Go to Grades → Should see your 85/100 grade

---

## 📝 SQL Script (Faster Method)

If you prefer SQL, copy this into Supabase SQL Editor:

```sql
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID from auth.users table

-- 1. Create a course
INSERT INTO courses (id, title, description, teacher_id, status)
VALUES 
  ('course-cs101', 'Computer Science 101', 'Intro to programming', 'YOUR_USER_ID_HERE', 'active'),
  ('course-math201', 'Calculus I', 'Introduction to calculus', 'YOUR_USER_ID_HERE', 'active'),
  ('course-eng301', 'English Literature', 'Classic works of literature', 'YOUR_USER_ID_HERE', 'active')
RETURNING id;

-- 2. Enroll yourself in courses
INSERT INTO enrollments (course_id, student_id, role)
VALUES 
  ('course-cs101', 'YOUR_USER_ID_HERE', 'student'),
  ('course-math201', 'YOUR_USER_ID_HERE', 'student'),
  ('course-eng301', 'YOUR_USER_ID_HERE', 'student');

-- 3. Add assignments to CS101
INSERT INTO assignments (course_id, title, description, due_date, max_points, type, status)
VALUES 
  ('course-cs101', 'Homework 1: Variables', 'Learn about variables and data types', '2026-04-15', 100, 'assignment', 'published'),
  ('course-cs101', 'Quiz 1: Basics', 'Test your knowledge of programming basics', '2026-04-12', 50, 'quiz', 'published'),
  ('course-cs101', 'Final Project', 'Build a simple calculator app', '2026-05-01', 200, 'project', 'published');

-- 4. Add assignments to Math201
INSERT INTO assignments (course_id, title, description, due_date, max_points, type, status)
VALUES 
  ('course-math201', 'Problem Set 1', 'Limits and continuity problems', '2026-04-10', 100, 'assignment', 'published'),
  ('course-math201', 'Midterm Exam', 'Covers chapters 1-5', '2026-04-20', 200, 'quiz', 'published');

-- 5. Add some grades
INSERT INTO grades (assignment_id, student_id, points, max_points, status, submitted_at, graded_at)
SELECT 
  a.id,
  'YOUR_USER_ID_HERE',
  CASE 
    WHEN a.title LIKE '%Homework%' THEN 85
    WHEN a.title LIKE '%Quiz%' THEN 45
    ELSE NULL
  END,
  a.max_points,
  CASE 
    WHEN a.title LIKE '%Project%' THEN 'pending'
    ELSE 'graded'
  END,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 day'
FROM assignments a
WHERE a.course_id IN ('course-cs101', 'course-math201');

-- 6. Add learning materials
INSERT INTO materials (course_id, title, description, file_url, file_type, file_size, uploaded_by)
VALUES 
  ('course-cs101', 'Python Basics.pdf', 'Introduction to Python programming', 'https://example.com/python-basics.pdf', 'pdf', '2.5 MB', 'YOUR_USER_ID_HERE'),
  ('course-cs101', 'Code Examples.zip', 'Sample code from lecture', 'https://example.com/examples.zip', 'archive', '1.2 MB', 'YOUR_USER_ID_HERE'),
  ('course-math201', 'Calculus Formulas.pdf', 'Essential calculus formulas', 'https://example.com/formulas.pdf', 'pdf', '800 KB', 'YOUR_USER_ID_HERE');
```

**Important**: Replace all instances of `'YOUR_USER_ID_HERE'` with your actual user ID!

---

## 🔍 How to Find Your User ID

### Method 1: Supabase Dashboard
1. Go to "Authentication" → "Users"
2. Find your email
3. Copy the UUID in the "id" column

### Method 2: SQL Query
Run this in SQL Editor:
```sql
SELECT id, email FROM auth.users;
```

### Method 3: Browser Console
1. Open http://localhost:8080
2. Login
3. Open DevTools (F12) → Console
4. Run:
```javascript
const { data } = await window.supabase.auth.getUser();
console.log('User ID:', data.user.id);
```

---

## 🎓 Understanding the Data

### Tables Overview

**courses**
- Stores course information
- Each course has a teacher_id (must be valid user)
- Status: active, archived, draft

**enrollments**
- Links students to courses
- Role: student, teacher, ta
- Created when user joins course

**assignments**
- Homework, quizzes, projects for a course
- Has due_date, max_points, type
- Status: draft, published, closed

**grades**
- Student grades for assignments
- Links assignment_id + student_id
- Status: pending, submitted, graded

**materials**
- Course materials (PDFs, videos, etc.)
- Has file_url pointing to storage
- Tracks downloads and file info

---

## 🧪 Test Data Scenarios

### Scenario 1: Empty State (Current)
```
Courses: 0
Enrollments: 0
Assignments: 0
Grades: 0

Dashboard shows: "No active classes"
```

### Scenario 2: Minimal Data
```
Courses: 1
Enrollments: 1 (you enrolled)
Assignments: 1
Grades: 0

Dashboard shows: 1 course card
ClassDetail shows: 1 assignment
Grades shows: No grades yet
```

### Scenario 3: Full Data (Recommended)
```
Courses: 3-5
Enrollments: 3-5 (you enrolled in all)
Assignments: 10-15 total
Grades: 5-8 graded
Materials: 5-10 files

Dashboard shows: Multiple course cards
ClassDetail shows: Assignments, materials
Grades shows: Letter grades, progress bars
```

---

## 🚀 Quick Test Script

Create 3 courses, enroll, add assignments, and grades:

```sql
-- Get your user ID first
SELECT id FROM auth.users WHERE email = 'your-email@example.com';
-- Copy the result and replace USER_ID below

-- Create courses
WITH new_courses AS (
  INSERT INTO courses (id, title, description, teacher_id, status)
  VALUES 
    ('cs-101', 'Computer Science 101', 'Programming fundamentals', 'USER_ID', 'active'),
    ('math-201', 'Calculus I', 'Differential calculus', 'USER_ID', 'active'),
    ('eng-301', 'English Lit', 'Classic literature', 'USER_ID', 'active')
  RETURNING id
)
-- Enroll in courses
INSERT INTO enrollments (course_id, student_id, role)
SELECT id, 'USER_ID', 'student' FROM new_courses;

-- Add assignments
WITH course_ids AS (SELECT id FROM courses WHERE id IN ('cs-101', 'math-201', 'eng-301'))
INSERT INTO assignments (course_id, title, due_date, max_points, type, status)
SELECT 
  id,
  'Assignment ' || ROW_NUMBER() OVER (PARTITION BY id),
  CURRENT_DATE + INTERVAL '1 week',
  100,
  'assignment',
  'published'
FROM course_ids, generate_series(1, 3);
```

---

## ✅ Verification

After adding data:

1. **Backend Logs**: Should see SQL queries in server console
2. **Network Tab**: Should see API responses with data (not empty arrays)
3. **Frontend**: Should show courses, assignments, grades
4. **No Errors**: Console should be clean

---

## 🎯 Next Steps

1. **Add data** using one of the methods above
2. **Refresh browser** (Ctrl+R)
3. **Should see courses** on dashboard
4. **Click course** → See assignments
5. **Go to grades** → See calculated grades

**Your system is now fully real!** 🎉

---

## 💡 Tips

- Start with 1-2 courses to test
- Add more data as needed
- Use realistic course names
- Set due dates in the future
- Add variety (assignments, quizzes, projects)

---

**Need Help?**
- Supabase Docs: https://supabase.com/docs
- SQL Reference: https://www.postgresql.org/docs/
- Check backend logs for errors
