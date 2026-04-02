# Code Review Examples

Real-world examples of code reviews with before/after comparisons.

## Example 1: Missing Error Handling

### ❌ Before (Issue)
```typescript
// server/src/controllers/courses.ts
export const getCourse = async (req: AuthRequest, res: Response) => {
  const courseId = req.params.id;
  const course = await courseService.getCourseById(courseId);
  res.json({ success: true, data: course });
};
```

### 🔴 Critical Issues
1. **No try-catch block** - Unhandled promise rejection
2. **No null check** - Will send `null` if course not found
3. **Missing next parameter** - Can't pass errors to error handler

### ✅ After (Fixed)
```typescript
export const getCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const courseId = req.params.id;
    const course = await courseService.getCourseById(courseId);
    
    if (!course) {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'Course not found',
        404
      );
    }
    
    const response: ApiResponse = {
      success: true,
      data: course,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
```

---

## Example 2: Missing Validation

### ❌ Before (Issue)
```typescript
router.post('/courses', authenticate, controller.createCourse);
```

```typescript
export const createCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, description } = req.body;
    const course = await courseService.createCourse({ title, description });
    res.status(201).json({ success: true, data: course });
  } catch (error) {
    next(error);
  }
};
```

### 🟡 Warnings
1. **No input validation** - Raw request body accepted
2. **No type safety** - `req.body` is `any`
3. **Missing authorization** - Any authenticated user can create

### ✅ After (Fixed)
```typescript
// types/courses.ts
export const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  syllabus: z.string().optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
```

```typescript
// routes/courses.ts
router.post('/courses',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: createCourseSchema }),
  controller.createCourse
);
```

```typescript
// controllers/courses.ts
export const createCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const courseData: CreateCourseInput = req.body; // Now type-safe!
    const teacherId = req.user!.id;
    
    const course = await courseService.createCourse({
      ...courseData,
      teacher_id: teacherId,
    });
    
    const response: ApiResponse = {
      success: true,
      data: course,
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};
```

---

## Example 3: Business Logic in Controller

### ❌ Before (Issue)
```typescript
export const enrollStudent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { courseId } = req.body;
    const studentId = req.user!.id;
    
    // Business logic in controller (bad!)
    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('status, capacity')
      .eq('id', courseId)
      .single();
    
    if (!course) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
    }
    
    if (course.status !== 'published') {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Course not available', 403);
    }
    
    const { data: enrollmentCount } = await supabaseAdmin
      .from('enrollments')
      .select('count')
      .eq('course_id', courseId);
    
    if (enrollmentCount >= course.capacity) {
      throw new ApiError(ErrorCode.CONFLICT, 'Course is full', 409);
    }
    
    const { data: enrollment } = await supabaseAdmin
      .from('enrollments')
      .insert({ course_id: courseId, student_id: studentId })
      .select()
      .single();
    
    res.status(201).json({ success: true, data: enrollment });
  } catch (error) {
    next(error);
  }
};
```

### 🟡 Warnings
1. **Business logic in controller** - Should be in service layer
2. **Multiple database queries** - Hard to test and reuse
3. **Tight coupling** - Controller directly uses Supabase

### ✅ After (Fixed)
```typescript
// services/enrollments.ts
export const enrollStudentInCourse = async (
  courseId: string,
  studentId: string
) => {
  // Check if course exists and is available
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('status, capacity')
    .eq('id', courseId)
    .single();
  
  if (courseError || !course) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'Course not found',
      404
    );
  }
  
  if (course.status !== 'published') {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Course is not available for enrollment',
      403
    );
  }
  
  // Check enrollment capacity
  const { count, error: countError } = await supabaseAdmin
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('status', 'active');
  
  if (countError) {
    logger.error('Failed to check enrollment capacity', {
      courseId,
      error: countError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to check course capacity',
      500
    );
  }
  
  if (count && count >= course.capacity) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'Course is at full capacity',
      409
    );
  }
  
  // Create enrollment
  const { data: enrollment, error: enrollError } = await supabaseAdmin
    .from('enrollments')
    .insert({
      course_id: courseId,
      student_id: studentId,
      status: 'active',
    })
    .select()
    .single();
  
  if (enrollError) {
    logger.error('Failed to create enrollment', {
      courseId,
      studentId,
      error: enrollError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to enroll in course',
      500
    );
  }
  
  return enrollment;
};
```

```typescript
// controllers/enrollments.ts
export const enrollStudent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { courseId } = req.body;
    const studentId = req.user!.id;
    
    const enrollment = await enrollmentService.enrollStudentInCourse(
      courseId,
      studentId
    );
    
    const response: ApiResponse = {
      success: true,
      data: enrollment,
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};
```

---

## Example 4: Missing TypeScript Types

### ❌ Before (Issue)
```typescript
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    
    const { data } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
```

### 🟡 Warnings
1. **Implicit any types** - `updates` and `data` have no types
2. **No validation** - Any fields can be updated
3. **Security risk** - User could update `role` field

### ✅ After (Fixed)
```typescript
// types/users.ts
export const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface ProfileResponse {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
```

```typescript
// routes/users.ts
router.put('/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  controller.updateProfile
);
```

```typescript
// controllers/users.ts
export const updateProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const updates: UpdateProfileInput = req.body;
    
    const profile = await userService.updateUserProfile(userId, updates);
    
    const response: ApiResponse<ProfileResponse> = {
      success: true,
      data: profile,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
```

```typescript
// services/users.ts
export const updateUserProfile = async (
  userId: string,
  updates: UpdateProfileInput
): Promise<ProfileResponse> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, email, first_name, last_name, role, avatar_url, created_at, updated_at')
    .single();
  
  if (error || !data) {
    logger.error('Failed to update profile', {
      userId,
      error: error?.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update profile',
      500
    );
  }
  
  return data;
};
```

---

## Example 5: Inconsistent Response Format

### ❌ Before (Issue)
```typescript
// Different response formats across endpoints
app.get('/api/users/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  res.json(user); // Direct object
});

app.get('/api/courses', async (req, res) => {
  const courses = await getCourses();
  res.json({ courses }); // Wrapped in object
});

app.post('/api/login', async (req, res) => {
  const token = await login(req.body);
  res.json({ status: 'success', token }); // Custom format
});
```

### 🟡 Warnings
1. **Inconsistent format** - Each endpoint returns different structure
2. **No error indication** - No `success` field
3. **Hard to parse** - Clients need different logic for each endpoint

### ✅ After (Fixed)
```typescript
// All responses use ApiResponse<T> type
app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await getUser(req.params.id);
    const response: ApiResponse<User> = {
      success: true,
      data: user,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get('/api/courses', async (req, res, next) => {
  try {
    const courses = await getCourses();
    const response: ApiResponse<Course[]> = {
      success: true,
      data: courses,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const session = await login(req.body);
    const response: ApiResponse<{ token: string }> = {
      success: true,
      data: { token: session.token },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});
```

---

## Review Comment Template

Use this template when providing feedback:

```markdown
### File: `path/to/file.ts`

**Lines X-Y**: [Brief description of issue]

**Problem**: [Explain what's wrong and why it matters]

**Current Code**:
```typescript
// problematic code
```

**Suggested Fix**:
```typescript
// improved code
```

**Rationale**: [Explain the reasoning behind the suggestion]

**Priority**: 🔴 Critical / 🟡 Warning / 🔵 Suggestion
```

---

## Common Patterns to Look For

### ✅ Good Patterns
- Routes → Controllers → Services separation
- Try-catch blocks in all async functions
- Input validation with Zod
- Type-safe request/response handling
- Proper error codes and status codes
- Consistent response format
- Meaningful variable names

### ❌ Anti-Patterns
- Business logic in routes or controllers
- Missing error handling
- Unvalidated user inputs
- Direct Supabase calls in controllers
- Inconsistent response formats
- Missing TypeScript types
- Hardcoded values
- console.log() instead of logger

---

**Remember**: Always be constructive and explain the "why" behind each suggestion. The goal is to help improve code quality while maintaining a positive team culture.
