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
  MaterialProgress,
  MaterialProgressWithStudent,
  CreateMaterialInput,
  UpdateMaterialInput,
  UpdateMaterialProgressInput,
  PaginatedCourses,
  CourseStatus,
  MaterialType,
} from '../types/courses.js';
import { notifyMaterialAdded } from './websocket.js';
import logger from '../utils/logger.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';

type DatabaseErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type MaterialUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

// ============================================
// Helpers
// ============================================

const COURSE_BASE_SELECT =
  'id, teacher_id, title, description, syllabus, status, created_at, updated_at';

const normalizeDbErrorText = (error?: DatabaseErrorShape | null): string => {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const isMissingRelationError = (error?: DatabaseErrorShape | null): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42P01'
    || message.includes('could not find the table')
    || message.includes('does not exist')
  );
};

const isPermissionDeniedError = (error?: DatabaseErrorShape | null): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42501'
    || message.includes('permission denied')
    || message.includes('row-level security')
  );
};

const MATERIALS_BUCKET = 'course-materials';
const MATERIALS_STORAGE_PROVIDER = 'supabase_storage';
const MATERIALS_FILE_SIZE_LIMIT = '50MB';
const MATERIALS_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'video/webm',
  'application/zip',
  'application/x-zip-compressed',
];

const isMissingBucketError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('bucket') && (normalized.includes('not found') || normalized.includes('does not exist'));
};

const isAlreadyExistsBucketError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate');
};

const isStoragePermissionDeniedError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes('not authorized')
    || normalized.includes('permission denied')
    || normalized.includes('forbidden')
    || normalized.includes('row-level security')
  );
};

const isStorageObjectMissingError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('not found') || normalized.includes('no such file') || normalized.includes('does not exist');
};

const toSafeStorageBaseName = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return 'material';
  }

  return normalized.slice(0, 80);
};

const extractFileExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }

  return fileName.slice(dotIndex + 1).trim().toLowerCase();
};

const buildMaterialStoragePath = (
  courseId: string,
  userId: string,
  title: string,
  originalName: string
): string => {
  const timestamp = Date.now();
  const titlePart = toSafeStorageBaseName(title || 'material');
  const extension = extractFileExtension(originalName);
  const extensionPart = extension ? `.${extension}` : '';
  return `${courseId}/${userId}/${timestamp}-${titlePart}${extensionPart}`;
};

const ensureMaterialsBucketExists = async (): Promise<void> => {
  const { data: bucket, error: getBucketError } = await supabaseAdmin.storage.getBucket(MATERIALS_BUCKET);

  if (!getBucketError && bucket) {
    return;
  }

  if (getBucketError && !isMissingBucketError(getBucketError.message)) {
    logger.warn('Could not verify materials bucket, attempting creation anyway', {
      error: getBucketError.message,
    });
  }

  const { error: createBucketError } = await supabaseAdmin.storage.createBucket(MATERIALS_BUCKET, {
    public: true,
    allowedMimeTypes: MATERIALS_ALLOWED_MIME_TYPES,
    fileSizeLimit: MATERIALS_FILE_SIZE_LIMIT,
  });

  if (!createBucketError) {
    return;
  }

  if (isAlreadyExistsBucketError(createBucketError.message)) {
    return;
  }

  if (isStoragePermissionDeniedError(createBucketError.message)) {
    logger.warn('Could not auto-create materials bucket due permissions. Proceeding with upload attempt.', {
      error: createBucketError.message,
    });
    return;
  }

  logger.warn('Failed to auto-create materials bucket. Proceeding with upload attempt.', {
    error: createBucketError.message,
  });
};

const uploadMaterialFile = async (
  courseId: string,
  userId: string,
  title: string,
  file: MaterialUploadFile
): Promise<{ objectPath: string; publicUrl: string }> => {
  await ensureMaterialsBucketExists();

  const objectPath = buildMaterialStoragePath(courseId, userId, title, file.originalname);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(MATERIALS_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    logger.error('Failed to upload course material', {
      courseId,
      userId,
      objectPath,
      error: uploadError.message,
    });

    if (isMissingBucketError(uploadError.message)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Course material storage is not configured. Please contact an administrator.',
        500
      );
    }

    if (isStoragePermissionDeniedError(uploadError.message)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Course material storage permissions are not configured correctly. Please contact an administrator.',
        500
      );
    }

    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to upload material file', 500);
  }

  const { data: urlData } = supabaseAdmin.storage
    .from(MATERIALS_BUCKET)
    .getPublicUrl(objectPath);

  return {
    objectPath,
    publicUrl: urlData.publicUrl,
  };
};

const inferMaterialTypeFromUpload = (file: MaterialUploadFile): MaterialType | null => {
  const mimeType = (file.mimetype || '').trim().toLowerCase();

  if (mimeType === 'application/pdf') {
    return MaterialType.PDF;
  }

  if (mimeType === 'video/mp4' || mimeType === 'video/webm') {
    return MaterialType.VIDEO;
  }

  if (MATERIALS_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return MaterialType.DOCUMENT;
  }

  return null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixMaterialProgressStudentJoin = (row: any): MaterialProgressWithStudent => {
  const student = Array.isArray(row.student) ? row.student[0] || null : row.student;
  return {
    ...row,
    student,
  } as MaterialProgressWithStudent;
};

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

const attachEnrollmentCountsToCourses = async (
  courses: Course[]
): Promise<CourseWithStats[]> => {
  if (!courses.length) {
    return [];
  }

  const courseIds = Array.from(
    new Set(courses.map((course) => course.id).filter(Boolean))
  );

  const { data: enrollmentRows, error } = await supabaseAdmin
    .from('enrollments')
    .select('course_id, student_id')
    .in('course_id', courseIds)
    .in('status', ACTIVE_ENROLLMENT_STATUSES);

  if (error) {
    logger.warn('Failed to fetch enrollment counts for course list', {
      error: error.message,
      courseCount: courseIds.length,
    });

    return courses.map((course) => ({
      ...course,
      enrollment_count: 0,
    }));
  }

  const enrollmentStudentIdsByCourseId = new Map<string, Set<string>>();

  for (const row of (enrollmentRows || []) as Array<{ course_id: string | null; student_id: string | null }>) {
    if (!row.course_id || !row.student_id) {
      continue;
    }

    let studentIds = enrollmentStudentIdsByCourseId.get(row.course_id);
    if (!studentIds) {
      studentIds = new Set<string>();
      enrollmentStudentIdsByCourseId.set(row.course_id, studentIds);
    }

    studentIds.add(row.student_id);
  }

  return courses.map((course) => ({
    ...course,
    enrollment_count: enrollmentStudentIdsByCourseId.get(course.id)?.size || 0,
  }));
};

const hasActiveEnrollment = async (courseId: string, studentId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .limit(1);

  if (error) {
    logger.error('Failed to verify course enrollment access', {
      courseId,
      studentId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to validate class access',
      500
    );
  }

  return Array.isArray(data) && data.length > 0;
};

const assertCourseReadAccess = async (
  courseId: string,
  courseTeacherId: string | null,
  userId?: string,
  userRole?: UserRole
): Promise<void> => {
  // Internal service calls without requester context intentionally skip read-guard checks.
  if (!userId || !userRole) {
    return;
  }

  if (userRole === UserRole.ADMIN) {
    return;
  }

  if (userRole === UserRole.TEACHER) {
    if (courseTeacherId === userId) {
      return;
    }

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Teachers can only access classes they teach',
      403
    );
  }

  if (userRole === UserRole.STUDENT) {
    const enrolled = await hasActiveEnrollment(courseId, userId);

    if (enrolled) {
      return;
    }

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Students can only access classes they are enrolled in',
      403
    );
  }

  throw new ApiError(
    ErrorCode.FORBIDDEN,
    'You do not have permission to access this class',
    403
  );
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
  includeStats: boolean = false,
  requesterId?: string,
  requesterRole?: UserRole
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

  await assertCourseReadAccess(
    courseId,
    (data as Course).teacher_id,
    requesterId,
    requesterRole
  );

  const course = (await attachTeacherToCourse(data as Course)) as CourseWithStats;

  // Optionally include stats
  if (includeStats) {
    const [enrollmentResult, assignmentResult] = await Promise.all([
      supabaseAdmin
        .from('enrollments')
        .select('student_id')
        .eq('course_id', courseId)
        .in('status', ACTIVE_ENROLLMENT_STATUSES),
      supabaseAdmin
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId),
    ]);

    if (enrollmentResult.error) {
      logger.warn('Failed to fetch enrollment stats for course', {
        courseId,
        error: enrollmentResult.error.message,
      });
      course.enrollment_count = 0;
    } else {
      course.enrollment_count = new Set(
        (enrollmentResult.data || [])
          .map((row) => row.student_id)
          .filter((studentId): studentId is string => Boolean(studentId))
      ).size;
    }

    if (assignmentResult.error) {
      logger.warn('Failed to fetch assignment stats for course', {
        courseId,
        error: assignmentResult.error.message,
      });
    }

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
  const {
    page,
    limit,
    status,
    teacher_id,
    search,
    include_enrollment_count,
  } = query;
  const offset = (page - 1) * limit;

  let queryBuilder = supabaseAdmin
    .from('courses')
    .select(COURSE_BASE_SELECT, { count: 'exact' });

  // Role-based filtering
  if (userRole === UserRole.STUDENT) {
    if (!userId) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Missing authenticated student context',
        401
      );
    }

    const { data: enrollmentRows, error: enrollmentError } = await supabaseAdmin
      .from('enrollments')
      .select('course_id')
      .eq('student_id', userId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES);

    if (enrollmentError) {
      logger.error('Failed to resolve student course access scope', {
        userId,
        error: enrollmentError.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to fetch enrolled courses',
        500
      );
    }

    const enrolledCourseIds = Array.from(
      new Set(
        (enrollmentRows || [])
          .map((row) => row.course_id)
          .filter((courseId): courseId is string => Boolean(courseId))
      )
    );

    if (enrolledCourseIds.length === 0) {
      return {
        courses: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    queryBuilder = queryBuilder.in('id', enrolledCourseIds);
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

  const baseCourses = await attachTeachersToCourses((data || []) as Course[]);
  const coursesWithStats =
    include_enrollment_count === 'true'
      ? await attachEnrollmentCountsToCourses(baseCourses)
      : baseCourses;

  return {
    courses: coursesWithStats,
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
  userRole: UserRole,
  uploadedFile?: MaterialUploadFile
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

  let fileUrl = input.file_url || null;
  let storageObjectPath: string | null = null;
  let storageProvider: string | null = null;
  let resolvedType = input.type;

  if (uploadedFile) {
    const inferredMaterialType = inferMaterialTypeFromUpload(uploadedFile);

    if (!inferredMaterialType) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Unsupported material file type uploaded.',
        400
      );
    }

    resolvedType = inferredMaterialType;

    const uploaded = await uploadMaterialFile(courseId, userId, input.title, uploadedFile);
    fileUrl = uploaded.publicUrl;
    storageObjectPath = uploaded.objectPath;
    storageProvider = MATERIALS_STORAGE_PROVIDER;
  }

  const { data, error } = await supabaseAdmin
    .from('course_materials')
    .insert({
      course_id: courseId,
      title: input.title,
      type: resolvedType,
      file_url: fileUrl,
      drive_file_id: storageObjectPath,
      drive_view_link: storageProvider,
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

  try {
    await notifyMaterialAdded(courseId, {
      id: String(data.id),
      title: String(data.title || input.title),
      courseId,
      courseName: course.title || 'Course',
      materialType: String(data.type || resolvedType || 'reading_material'),
      fileUrl: typeof fileUrl === 'string' ? fileUrl : null,
    });
  } catch (notifyError) {
    logger.warn('Failed to broadcast material created event', {
      courseId,
      materialId: data.id,
      error: notifyError instanceof Error ? notifyError.message : String(notifyError),
    });
  }

  return data as CourseMaterial;
};

/**
 * List course materials
 */
export const listMaterials = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<CourseMaterial[]> => {
  // Verify course exists and requester is allowed to view it.
  await getCourseById(courseId, false, userId, userRole);

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
export const getMaterialById = async (
  materialId: string,
  requesterId?: string,
  requesterRole?: UserRole
): Promise<CourseMaterial> => {
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

  const material = data as CourseMaterial;

  if (requesterId && requesterRole) {
    await getCourseById(material.course_id, false, requesterId, requesterRole);
  }

  return material;
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

  const shouldDeleteStoredFile =
    material.drive_view_link === MATERIALS_STORAGE_PROVIDER
    && typeof material.drive_file_id === 'string'
    && material.drive_file_id.trim().length > 0;

  if (shouldDeleteStoredFile) {
    const objectPath = material.drive_file_id!.trim();
    const { error: storageDeleteError } = await supabaseAdmin.storage
      .from(MATERIALS_BUCKET)
      .remove([objectPath]);

    if (storageDeleteError && !isStorageObjectMissingError(storageDeleteError.message)) {
      logger.error('Failed to delete material file from storage', {
        materialId,
        objectPath,
        error: storageDeleteError.message,
      });

      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to delete material file from storage',
        500
      );
    }
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

/**
 * Get the current student's progress for a material.
 */
export const getMyMaterialProgress = async (
  materialId: string,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgress> => {
  if (userRole !== UserRole.STUDENT) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only students can view personal material progress',
      403
    );
  }

  const material = await getMaterialById(materialId, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .select('*')
    .eq('material_id', materialId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Material progress tracking is unavailable. Run the latest migrations.',
        503,
        {
          reason: 'MATERIAL_PROGRESS_SCHEMA_OUTDATED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

    logger.error('Failed to fetch material progress', {
      materialId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch material progress', 500);
  }

  if (data) {
    return data as MaterialProgress;
  }

  const nowIso = new Date().toISOString();
  const { data: createdRow, error: createError } = await supabaseAdmin
    .from('material_progress')
    .insert({
      material_id: materialId,
      course_id: material.course_id,
      user_id: userId,
      progress_percent: 0,
      completed: false,
      last_viewed_at: nowIso,
      completed_at: null,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (createError) {
    if (isMissingRelationError(createError)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Material progress tracking is unavailable. Run the latest migrations.',
        503,
        {
          reason: 'MATERIAL_PROGRESS_SCHEMA_OUTDATED',
          db_code: createError.code,
          db_message: createError.message,
        }
      );
    }

    if (createError.code === '23505') {
      const { data: reloaded, error: reloadError } = await supabaseAdmin
        .from('material_progress')
        .select('*')
        .eq('material_id', materialId)
        .eq('user_id', userId)
        .single();

      if (!reloadError && reloaded) {
        return reloaded as MaterialProgress;
      }
    }

    logger.error('Failed to initialize material progress', {
      materialId,
      userId,
      error: createError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to initialize material progress', 500);
  }

  return createdRow as MaterialProgress;
};

/**
 * Update the current student's progress for a material.
 */
export const updateMyMaterialProgress = async (
  materialId: string,
  input: UpdateMaterialProgressInput,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgress> => {
  if (userRole !== UserRole.STUDENT) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only students can update material progress',
      403
    );
  }

  const current = await getMyMaterialProgress(materialId, userId, userRole);

  let resolvedProgressPercent = input.progress_percent ?? current.progress_percent;
  const completedFromInput = typeof input.completed === 'boolean' ? input.completed : undefined;
  const resolvedCompleted = completedFromInput ?? resolvedProgressPercent >= 100;

  if (resolvedCompleted && resolvedProgressPercent < 100) {
    resolvedProgressPercent = 100;
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .update({
      progress_percent: resolvedProgressPercent,
      completed: resolvedCompleted,
      last_viewed_at: input.last_viewed_at || nowIso,
      completed_at: resolvedCompleted ? current.completed_at || nowIso : null,
      updated_at: nowIso,
    })
    .eq('id', current.id)
    .select('*')
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Material progress tracking is unavailable. Run the latest migrations.',
        503,
        {
          reason: 'MATERIAL_PROGRESS_SCHEMA_OUTDATED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

    logger.error('Failed to update material progress', {
      materialId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update material progress', 500);
  }

  return data as MaterialProgress;
};

/**
 * List student progress rows for a material (teacher/admin view).
 */
export const listMaterialProgress = async (
  materialId: string,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgressWithStudent[]> => {
  if (userRole !== UserRole.ADMIN && userRole !== UserRole.TEACHER) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only teachers and admins can view student material progress',
      403
    );
  }

  const material = await getMaterialById(materialId, userId, userRole);
  await getCourseById(material.course_id, false, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .select(`
      id,
      material_id,
      course_id,
      user_id,
      progress_percent,
      completed,
      last_viewed_at,
      completed_at,
      created_at,
      updated_at,
      student:profiles!material_progress_user_id_fkey(id, email, first_name, last_name)
    `)
    .eq('material_id', materialId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Material progress tracking is unavailable. Run the latest migrations.',
        503,
        {
          reason: 'MATERIAL_PROGRESS_SCHEMA_OUTDATED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

    logger.error('Failed to list material progress', {
      materialId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list material progress', 500);
  }

  return (data || []).map(fixMaterialProgressStudentJoin);
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

    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Course storage is not available. Run migrations 001_initial_schema and latest migrations.',
        503,
        {
          reason: 'COURSES_SCHEMA_OUTDATED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

    if (isPermissionDeniedError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Database permission denied while archiving course. Verify SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY uses a service role/secret key.',
        503,
        {
          reason: 'SUPABASE_PERMISSION_DENIED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

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

    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Course storage is not available. Run migrations 001_initial_schema and latest migrations.',
        503,
        {
          reason: 'COURSES_SCHEMA_OUTDATED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

    if (isPermissionDeniedError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Database permission denied while unarchiving course. Verify SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY uses a service role/secret key.',
        503,
        {
          reason: 'SUPABASE_PERMISSION_DENIED',
          db_code: error.code,
          db_message: error.message,
        }
      );
    }

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
export const getCourseStudents = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<any[]> => {
  // Verify course exists and requester is allowed to view it.
  await getCourseById(courseId, false, userId, userRole);

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
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .order('enrolled_at', { ascending: false });

  if (error) {
    logger.error('Failed to get course students', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get course students', 500);
  }

  const uniqueStudents = new Map<string, any>();

  // Keep the most recent enrollment row for each student and ignore duplicate rows.
  for (const enrollment of data || []) {
    const student = Array.isArray(enrollment.student) 
      ? enrollment.student[0] 
      : enrollment.student;

    if (!student?.id || uniqueStudents.has(student.id)) {
      continue;
    }

    uniqueStudents.set(student.id, {
      id: student?.id,
      email: student?.email,
      first_name: student?.first_name,
      last_name: student?.last_name,
      avatar_url: student?.avatar_url,
      enrolled_at: enrollment.enrolled_at,
      enrollment_status: enrollment.status,
    });
  }

  return Array.from(uniqueStudents.values()).sort((a, b) => {
    const left = new Date(a.enrolled_at || 0).getTime();
    const right = new Date(b.enrolled_at || 0).getTime();
    return left - right;
  });
};

/**
 * Get teacher(s) for a course
 */
export const getCourseTeachers = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<any[]> => {
  const course = await getCourseById(courseId, false, userId, userRole);

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
