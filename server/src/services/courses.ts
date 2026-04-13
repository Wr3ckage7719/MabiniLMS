import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  Course,
  CourseTeacher,
  CourseWithStats,
  CreateCourseInput,
  UpdateCourseInput,
  UpdateCourseStatusInput,
  ListCoursesQuery,
  CourseMaterial,
  CreateMaterialInput,
  UpdateMaterialInput,
  PaginatedCourses,
  CourseStatus,
} from '../types/courses.js';
import logger from '../utils/logger.js';

// ============================================
// Helpers
// ============================================

const COURSE_BASE_SELECT =
  'id, teacher_id, title, description, syllabus, status, created_at, updated_at';

const attachTeachersToCourses = async (courses: Course[]): Promise<Course[]> => {
  if (!courses.length) {
    return courses;
  }

  const teacherIds = Array.from(
    new Set(
      courses
        .map((course) => course.teacher_id)
        .filter((teacherId): teacherId is string => Boolean(teacherId))
    )
  );

  if (teacherIds.length === 0) {
    return courses.map((course) => ({ ...course, teacher: null }));
  }

  const { data: teacherRows, error: teacherError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', teacherIds);

  if (teacherError) {
    logger.warn('Failed to fetch teacher profiles for courses', {
      error: teacherError.message,
      teacherCount: teacherIds.length,
    });
    return courses.map((course) => ({ ...course, teacher: null }));
  }

  const teacherById = new Map<string, CourseTeacher>();
  for (const row of teacherRows || []) {
    teacherById.set(row.id, row as CourseTeacher);
  }

  return courses.map((course) => ({
    ...course,
    teacher: course.teacher_id ? teacherById.get(course.teacher_id) || null : null,
  }));
};

const attachTeacherToCourse = async (course: Course): Promise<Course> => {
  const [result] = await attachTeachersToCourses([course]);
  return result;
};

// ============================================
// Course CRUD Operations
// ============================================

/**
 * Create a new course
 */
export const createCourse = async (
  input: CreateCourseInput,
  teacherId: string
): Promise<Course> => {
  const insertPayload = {
    ...input,
    status: input.status || CourseStatus.PUBLISHED,
    teacher_id: teacherId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert(insertPayload)
    .select(COURSE_BASE_SELECT)
    .single();

  if (error) {
    logger.error('Failed to create course', { error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create course',
      500
    );
  }

  return attachTeacherToCourse(data as Course);
};

/**
 * Get course by ID
 */
export const getCourseById = async (
  courseId: string,
  includeStats: boolean = false
): Promise<CourseWithStats> => {
  const query = supabaseAdmin
    .from('courses')
    .select(COURSE_BASE_SELECT)
    .eq('id', courseId)
    .single();

  const { data, error } = await query;

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'Course not found',
        404
      );
    }
    logger.error('Failed to fetch course', { courseId, error: error?.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch course',
      500
    );
  }

  const course = (await attachTeacherToCourse(data as Course)) as CourseWithStats;

  // Optionally include stats
  if (includeStats) {
    const [enrollmentResult, assignmentResult] = await Promise.all([
      supabaseAdmin
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('status', 'active'),
      supabaseAdmin
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId),
    ]);

    course.enrollment_count = enrollmentResult.count || 0;
    course.assignment_count = assignmentResult.count || 0;
  }

  return course;
};

/**
 * List courses with pagination and filtering
 */
export const listCourses = async (
  query: ListCoursesQuery,
  userId?: string,
  userRole?: UserRole
): Promise<PaginatedCourses> => {
  const { page, limit, status, teacher_id, search } = query;
  const offset = (page - 1) * limit;

  let queryBuilder = supabaseAdmin
    .from('courses')
    .select(COURSE_BASE_SELECT, { count: 'exact' });

  // Role-based filtering
  if (userRole === UserRole.STUDENT) {
    // Students only see published courses
    queryBuilder = queryBuilder.eq('status', CourseStatus.PUBLISHED);
  } else if (userRole === UserRole.TEACHER && userId) {
    // Teachers can only access courses they own.
    queryBuilder = queryBuilder.eq('teacher_id', userId);
  }
  // Admins see all courses

  // Apply status filter
  if (status) {
    queryBuilder = queryBuilder.eq('status', status);
  }

  // Apply teacher filter
  if (teacher_id && userRole === UserRole.ADMIN) {
    queryBuilder = queryBuilder.eq('teacher_id', teacher_id);
  }

  // Apply search filter
  if (search) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`
    );
  }

  // Apply pagination and ordering
  queryBuilder = queryBuilder
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;

  if (error) {
    logger.error('Failed to list courses', { error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch courses',
      500
    );
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    courses: await attachTeachersToCourses((data || []) as Course[]),
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Update course
 */
export const updateCourse = async (
  courseId: string,
  input: UpdateCourseInput,
  userId: string,
  userRole: UserRole
): Promise<Course> => {
  // Check if course exists and user has permission
  const course = await getCourseById(courseId);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only update your own courses',
      403
    );
  }

  const updateData: Record<string, any> = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const { data, error } = await supabaseAdmin
    .from('courses')
    .update(updateData)
    .eq('id', courseId)
    .select(COURSE_BASE_SELECT)
    .single();

  if (error) {
    logger.error('Failed to update course', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update course',
      500
    );
  }

  return attachTeacherToCourse(data as Course);
};

/**
 * Update course status
 */
export const updateCourseStatus = async (
  courseId: string,
  input: UpdateCourseStatusInput,
  userId: string,
  userRole: string
): Promise<Course> => {
  // Check if course exists and user has permission
  const course = await getCourseById(courseId);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only update your own courses',
      403
    );
  }

  // Validate status transition
  const validTransitions: Record<CourseStatus, CourseStatus[]> = {
    [CourseStatus.DRAFT]: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED],
    [CourseStatus.PUBLISHED]: [CourseStatus.ARCHIVED],
    [CourseStatus.ARCHIVED]: [CourseStatus.DRAFT, CourseStatus.PUBLISHED],
  };

  const currentStatus = course.status as CourseStatus;
  if (!validTransitions[currentStatus].includes(input.status)) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot change status from ${currentStatus} to ${input.status}`,
      400
    );
  }

  const { data, error } = await supabaseAdmin
    .from('courses')
    .update({
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId)
    .select(COURSE_BASE_SELECT)
    .single();

  if (error) {
    logger.error('Failed to update course status', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update course status',
      500
    );
  }

  return attachTeacherToCourse(data as Course);
};

/**
 * Delete course
 */
export const deleteCourse = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  // Check if course exists and user has permission
  const course = await getCourseById(courseId);

  // Only admins or the course teacher can delete
  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only delete your own courses',
      403
    );
  }

  const { error } = await supabaseAdmin
    .from('courses')
    .delete()
    .eq('id', courseId);

  if (error) {
    logger.error('Failed to delete course', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to delete course',
      500
    );
  }
};

// ============================================
// Course Materials Operations
// ============================================

/**
 * Create course material
 */
export const createMaterial = async (
  courseId: string,
  input: CreateMaterialInput,
  userId: string,
  userRole: UserRole
): Promise<CourseMaterial> => {
  // Check course exists and user has permission
  const course = await getCourseById(courseId);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only add materials to your own courses',
      403
    );
  }

  const { data, error } = await supabaseAdmin
    .from('course_materials')
    .insert({
      course_id: courseId,
      title: input.title,
      type: input.type,
      file_url: input.file_url || null,
      uploaded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create material', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create material',
      500
    );
  }

  return data as CourseMaterial;
};

/**
 * List course materials
 */
export const listMaterials = async (courseId: string): Promise<CourseMaterial[]> => {
  // Verify course exists
  await getCourseById(courseId);

  const { data, error } = await supabaseAdmin
    .from('course_materials')
    .select('*')
    .eq('course_id', courseId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    logger.error('Failed to list materials', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch materials',
      500
    );
  }

  return (data || []) as CourseMaterial[];
};

/**
 * Get material by ID
 */
export const getMaterialById = async (materialId: string): Promise<CourseMaterial> => {
  const { data, error } = await supabaseAdmin
    .from('course_materials')
    .select('*')
    .eq('id', materialId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'Material not found',
        404
      );
    }
    logger.error('Failed to fetch material', { materialId, error: error?.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch material',
      500
    );
  }

  return data as CourseMaterial;
};

/**
 * Update course material
 */
export const updateMaterial = async (
  materialId: string,
  input: UpdateMaterialInput,
  userId: string,
  userRole: UserRole
): Promise<CourseMaterial> => {
  // Get material and check permissions
  const material = await getMaterialById(materialId);
  const course = await getCourseById(material.course_id);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only update materials in your own courses',
      403
    );
  }

  const updateData: Record<string, any> = { ...input };
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const { data, error } = await supabaseAdmin
    .from('course_materials')
    .update(updateData)
    .eq('id', materialId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update material', { materialId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update material',
      500
    );
  }

  return data as CourseMaterial;
};

/**
 * Delete course material
 */
export const deleteMaterial = async (
  materialId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  // Get material and check permissions
  const material = await getMaterialById(materialId);
  const course = await getCourseById(material.course_id);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only delete materials from your own courses',
      403
    );
  }

  const { error } = await supabaseAdmin
    .from('course_materials')
    .delete()
    .eq('id', materialId);

  if (error) {
    logger.error('Failed to delete material', { materialId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to delete material',
      500
    );
  }
};

// ============================================
// Course Archive/Unarchive Operations
// ============================================

/**
 * Archive a course
 */
export const archiveCourse = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<Course> => {
  const course = await getCourseById(courseId);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only archive your own courses',
      403
    );
  }

  if (course.status === CourseStatus.ARCHIVED) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Course is already archived',
      400
    );
  }

  const { data, error } = await supabaseAdmin
    .from('courses')
    .update({
      status: CourseStatus.ARCHIVED,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId)
    .select(COURSE_BASE_SELECT)
    .single();

  if (error) {
    logger.error('Failed to archive course', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to archive course', 500);
  }

  return attachTeacherToCourse(data as Course);
};

/**
 * Unarchive a course
 */
export const unarchiveCourse = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<Course> => {
  const course = await getCourseById(courseId);

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only unarchive your own courses',
      403
    );
  }

  if (course.status !== CourseStatus.ARCHIVED) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Course is not archived',
      400
    );
  }

  // Unarchive returns to published status
  const { data, error } = await supabaseAdmin
    .from('courses')
    .update({
      status: CourseStatus.PUBLISHED,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId)
    .select(COURSE_BASE_SELECT)
    .single();

  if (error) {
    logger.error('Failed to unarchive course', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to unarchive course', 500);
  }

  return attachTeacherToCourse(data as Course);
};

// ============================================
// Course Participants Operations
// ============================================

/**
 * Get enrolled students in a course
 */
export const getCourseStudents = async (courseId: string): Promise<any[]> => {
  // Verify course exists
  await getCourseById(courseId);

  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select(`
      id,
      enrolled_at,
      status,
      student:profiles!enrollments_student_id_fkey(
        id, email, first_name, last_name, avatar_url
      )
    `)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .order('enrolled_at', { ascending: true });

  if (error) {
    logger.error('Failed to get course students', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get course students', 500);
  }

  // Transform to flatten student data
  return (data || []).map((enrollment: any) => {
    const student = Array.isArray(enrollment.student) 
      ? enrollment.student[0] 
      : enrollment.student;
    return {
      id: student?.id,
      email: student?.email,
      first_name: student?.first_name,
      last_name: student?.last_name,
      avatar_url: student?.avatar_url,
      enrolled_at: enrollment.enrolled_at,
      enrollment_status: enrollment.status,
    };
  });
};

/**
 * Get teacher(s) for a course
 */
export const getCourseTeachers = async (courseId: string): Promise<any[]> => {
  const course = await getCourseById(courseId);

  // Currently courses have a single teacher, but return as array for future extensibility
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, avatar_url')
    .eq('id', course.teacher_id)
    .single();

  if (error) {
    logger.error('Failed to get course teachers', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get course teachers', 500);
  }

  return data ? [data] : [];
};
