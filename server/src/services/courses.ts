import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  Course,
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
// Helper: Fix Supabase nested join arrays
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixTeacherJoin = (data: any): Course => {
  if (!data) return data;
  return {
    ...data,
    teacher: Array.isArray(data.teacher) ? data.teacher[0] || null : data.teacher
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixTeacherJoinArray = (dataArray: any[]): Course[] => {
  return (dataArray || []).map(fixTeacherJoin);
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
  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert({
      ...input,
      teacher_id: teacherId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(`
      id, teacher_id, title, description, syllabus, status, created_at, updated_at,
      teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
    `)
    .single();

  if (error) {
    logger.error('Failed to create course', { error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create course',
      500
    );
  }

  return fixTeacherJoin(data);
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
    .select(`
      id, teacher_id, title, description, syllabus, status, created_at, updated_at,
      teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
    `)
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

  const course = fixTeacherJoin(data) as CourseWithStats;

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
    .select(`
      id, teacher_id, title, description, syllabus, status, created_at, updated_at,
      teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
    `, { count: 'exact' });

  // Role-based filtering
  if (userRole === UserRole.STUDENT) {
    // Students only see published courses
    queryBuilder = queryBuilder.eq('status', CourseStatus.PUBLISHED);
  } else if (userRole === UserRole.TEACHER && userId) {
    // Teachers see their own courses OR published courses
    if (teacher_id === userId) {
      // If explicitly filtering by their own, show all statuses
      queryBuilder = queryBuilder.eq('teacher_id', userId);
    } else if (!teacher_id) {
      // Show their own courses + all published
      queryBuilder = queryBuilder.or(`teacher_id.eq.${userId},status.eq.published`);
    }
  }
  // Admins see all courses

  // Apply status filter (if admin or viewing own courses)
  if (status && (userRole === UserRole.ADMIN || teacher_id === userId)) {
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
    courses: fixTeacherJoinArray(data || []),
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
    .select(`
      id, teacher_id, title, description, syllabus, status, created_at, updated_at,
      teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
    `)
    .single();

  if (error) {
    logger.error('Failed to update course', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update course',
      500
    );
  }

  return fixTeacherJoin(data);
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
    .select(`
      id, teacher_id, title, description, syllabus, status, created_at, updated_at,
      teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
    `)
    .single();

  if (error) {
    logger.error('Failed to update course status', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update course status',
      500
    );
  }

  return fixTeacherJoin(data);
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
