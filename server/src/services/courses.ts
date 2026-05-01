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
  MaterialEngagementEvent,
  MaterialEngagementEventType,
  MaterialEngagementSummary,
  MaterialProgress,
  MaterialProgressWithStudent,
  CreateMaterialInput,
  TrackMaterialDownloadInput,
  TrackMaterialProgressInput,
  TrackMaterialViewEndInput,
  TrackMaterialViewStartInput,
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
  size: number;
};

// ============================================
// Helpers
// ============================================

// Wildcard select keeps the migration 033 columns optional for older
// databases — Postgres returns whatever columns exist instead of failing
// on a missing-column error. Matches the pattern used by the assignments
// service.
const COURSE_BASE_SELECT = '*';

// Columns that may not exist on databases that have not yet run migration
// 033_course_lms_config — the create/update flows retry without them when
// Postgres reports an undefined column.
const COURSE_COMPAT_OPTIONAL_COLUMNS = new Set<string>([
  'tags',
  'completion_policy',
  'category_weights',
  'enrolment_key',
]);

const extractMissingCourseColumn = (error?: DatabaseErrorShape | null): string | null => {
  if (!error) return null;
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  for (const column of COURSE_COMPAT_OPTIONAL_COLUMNS) {
    if (message.includes(`column "${column}"`) || message.includes(`column ${column}`)) {
      return column;
    }
  }
  if (error.code === '42703') {
    // generic undefined-column without a quoted name — caller handles fallback.
    return null;
  }
  return null;
};

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

const isMissingCourseMaterialMetadataColumnError = (error?: DatabaseErrorShape | null): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42703' && (message.includes('file_size') || message.includes('uploaded_by'))
  ) || (
    message.includes('column')
    && (message.includes('file_size') || message.includes('uploaded_by'))
    && message.includes('does not exist')
  );
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

const normalizePercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
};

const toFiniteNumber = (value: unknown, fallback: number = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePagesViewed = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const pageSet = new Set<number>();
  for (const item of value) {
    if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
      pageSet.add(item);
    }
  }

  return Array.from(pageSet).sort((a, b) => a - b);
};

const normalizeInteractionEvents = (value: unknown): MaterialEngagementEvent[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: MaterialEngagementEvent[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const event = item as Partial<MaterialEngagementEvent>;
    if (
      (event.type !== 'view_start'
        && event.type !== 'view_end'
        && event.type !== 'download'
        && event.type !== 'scroll')
      || typeof event.timestamp !== 'string'
    ) {
      continue;
    }

    normalized.push({
      type: event.type,
      timestamp: event.timestamp,
      data: event.data && typeof event.data === 'object'
        ? event.data as Record<string, unknown>
        : {},
    });
  }

  return normalized;
};

const buildMaterialEngagementEvent = (
  type: MaterialEngagementEventType,
  data: Record<string, unknown>
): MaterialEngagementEvent => {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
};

const upsertInteractionEvent = (
  events: MaterialEngagementEvent[],
  type: MaterialEngagementEventType,
  dataBuilder: (previous: MaterialEngagementEvent | null) => Record<string, unknown>
): MaterialEngagementEvent[] => {
  const normalizedEvents = normalizeInteractionEvents(events);
  const existingIndex = normalizedEvents.findIndex((event) => event.type === type);
  const previousEvent = existingIndex >= 0 ? normalizedEvents[existingIndex] : null;
  const nextEvent = buildMaterialEngagementEvent(type, dataBuilder(previousEvent));

  if (existingIndex < 0) {
    return [...normalizedEvents, nextEvent];
  }

  const updatedEvents = [...normalizedEvents];
  updatedEvents[existingIndex] = nextEvent;
  return updatedEvents;
};

const countEventsByType = (
  events: MaterialEngagementEvent[],
  type: MaterialEngagementEventType
): number => {
  if (type === 'view_start') {
    const viewStartEvent = events.find((event) => event.type === 'view_start');
    if (viewStartEvent) {
      const openCount = Math.floor(toFiniteNumber(viewStartEvent.data?.open_count, 0));
      if (openCount > 0) {
        return openCount;
      }
    }
  }

  return events.filter((event) => event.type === type).length;
};

const computeAverageSessionDurationSeconds = (
  events: MaterialEngagementEvent[]
): number | null => {
  const latestViewEndEvent = events.find((event) => event.type === 'view_end');
  if (latestViewEndEvent) {
    const sessionCount = Math.max(
      1,
      Math.floor(toFiniteNumber(latestViewEndEvent.data?.session_count, 0))
    );
    const totalTimeSpentSeconds = toFiniteNumber(
      latestViewEndEvent.data?.total_time_spent_seconds,
      NaN
    );

    if (Number.isFinite(totalTimeSpentSeconds) && totalTimeSpentSeconds >= 0) {
      return Math.round((totalTimeSpentSeconds / sessionCount) * 100) / 100;
    }

    const latestSessionSeconds = toFiniteNumber(
      latestViewEndEvent.data?.time_spent_seconds,
      NaN
    );

    if (Number.isFinite(latestSessionSeconds) && latestSessionSeconds >= 0) {
      return Math.round(latestSessionSeconds * 100) / 100;
    }
  }

  const sessions = events
    .filter((event) => event.type === 'view_end')
    .map((event) => {
      const raw = event.data?.time_spent_seconds;
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
    })
    .filter((value): value is number => value !== null);

  if (sessions.length === 0) {
    return null;
  }

  const totalSeconds = sessions.reduce((sum, value) => sum + value, 0);
  return Math.round((totalSeconds / sessions.length) * 100) / 100;
};

const computeTotalScanSeconds = (
  events: MaterialEngagementEvent[]
): number => {
  const latestScrollEvent = events.find((event) => event.type === 'scroll');
  if (latestScrollEvent) {
    const aggregatedActiveSeconds = toFiniteNumber(
      latestScrollEvent.data?.active_seconds,
      NaN
    );

    if (Number.isFinite(aggregatedActiveSeconds) && aggregatedActiveSeconds >= 0) {
      return Math.round(aggregatedActiveSeconds);
    }
  }

  const scrollActiveSeconds = events
    .filter((event) => event.type === 'scroll')
    .map((event) => {
      const raw = event.data?.active_seconds;
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
    })
    .reduce((sum, value) => sum + value, 0);

  if (scrollActiveSeconds > 0) {
    return Math.round(scrollActiveSeconds);
  }

  const viewEndSeconds = events
    .filter((event) => event.type === 'view_end')
    .map((event) => {
      const raw = event.data?.time_spent_seconds;
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
    })
    .reduce((sum, value) => sum + value, 0);

  return Math.round(viewEndSeconds);
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
  const mutablePayload: Record<string, unknown> = {
    ...input,
    status: input.status || CourseStatus.PUBLISHED,
    teacher_id: teacherId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Retry without optional columns if the migration hasn't been applied yet.
  // Same pattern the assignments service uses for backwards compatibility.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .insert(mutablePayload)
      .select(COURSE_BASE_SELECT)
      .single();

    if (!error) {
      return attachTeacherToCourse(data as Course);
    }

    const missingColumn = extractMissingCourseColumn(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(mutablePayload, missingColumn)) {
      delete mutablePayload[missingColumn];
      logger.warn('Retrying course insert without optional column', {
        teacherId,
        missingColumn,
        attempt: attempt + 1,
      });
      continue;
    }

    logger.error('Failed to create course', { error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create course',
      500
    );
  }

  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create course', 500);
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
  let studentArchivedByCourseId: Map<string, string | null> | null = null;
  if (userRole === UserRole.STUDENT) {
    if (!userId) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Missing authenticated student context',
        401
      );
    }

    const selectWithArchive = 'course_id, archived_at';
    let enrollmentRows: Array<{ course_id: string; archived_at?: string | null }> | null = null;
    let enrollmentError: { code?: string; message?: string } | null = null;

    {
      const { data, error } = await supabaseAdmin
        .from('enrollments')
        .select(selectWithArchive)
        .eq('student_id', userId)
        .in('status', ACTIVE_ENROLLMENT_STATUSES);
      enrollmentRows = (data || null) as typeof enrollmentRows;
      enrollmentError = error;
    }

    if (enrollmentError && enrollmentError.code === '42703') {
      // archived_at column missing (migration 031 not yet applied) — fall back silently.
      const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
        .from('enrollments')
        .select('course_id')
        .eq('student_id', userId)
        .in('status', ACTIVE_ENROLLMENT_STATUSES);
      enrollmentRows = (fallbackRows || null) as typeof enrollmentRows;
      enrollmentError = fallbackError;
    }

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

    studentArchivedByCourseId = new Map();
    for (const row of (enrollmentRows || []) as Array<{ course_id: string; archived_at?: string | null }>) {
      if (row.course_id) {
        studentArchivedByCourseId.set(row.course_id, row.archived_at ?? null);
      }
    }

    const enrolledCourseIds = Array.from(studentArchivedByCourseId.keys());

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

  const coursesWithArchiveFlag = studentArchivedByCourseId
    ? coursesWithStats.map((course) => ({
        ...course,
        archived_by_me: (studentArchivedByCourseId!.get(course.id) ?? null) !== null,
      }))
    : coursesWithStats;

  return {
    courses: coursesWithArchiveFlag,
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

  // Retry without optional columns if migration 033 hasn't been applied.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .update(updateData)
      .eq('id', courseId)
      .select(COURSE_BASE_SELECT)
      .single();

    if (!error) {
      return attachTeacherToCourse(data as Course);
    }

    const missingColumn = extractMissingCourseColumn(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(updateData, missingColumn)) {
      delete updateData[missingColumn];
      logger.warn('Retrying course update without optional column', {
        courseId,
        missingColumn,
        attempt: attempt + 1,
      });
      continue;
    }

    logger.error('Failed to update course', { courseId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update course',
      500
    );
  }

  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update course', 500);
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
  uploadedFile?: MaterialUploadFile,
  uploadedBy?: string
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

  const baseInsertPayload = {
    course_id: courseId,
    title: input.title,
    type: resolvedType,
    file_url: fileUrl,
    drive_file_id: storageObjectPath,
    drive_view_link: storageProvider,
    uploaded_at: new Date().toISOString(),
  };

  const metadataInsertPayload = {
    ...baseInsertPayload,
    file_size: uploadedFile?.size ?? null,
    uploaded_by: uploadedBy || userId,
  };

  let createdMaterial: unknown = null;
  let insertError: DatabaseErrorShape | null = null;

  const insertMaterial = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabaseAdmin
      .from('course_materials')
      .insert(payload)
      .select()
      .single();

    createdMaterial = data;
    insertError = error as DatabaseErrorShape | null;
  };

  await insertMaterial(metadataInsertPayload);

  if (insertError && isMissingCourseMaterialMetadataColumnError(insertError)) {
    await insertMaterial(baseInsertPayload);
  }

  if (insertError || !createdMaterial) {
    const insertErrorMessage = (insertError as DatabaseErrorShape | null)?.message;
    logger.error('Failed to create material', { courseId, error: insertErrorMessage });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create material',
      500
    );
  }

  const data = createdMaterial as CourseMaterial;

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

  // D10 — every material belongs to a lesson. The new lesson-builder flow
  // passes lesson_id directly; the legacy flow (no lesson_id) falls back to
  // parking in the course's auto-generated General lesson.
  if (input.lesson_id) {
    await attachMaterialToLesson(courseId, input.lesson_id, String(data.id));
  } else {
    await ensureMaterialParkedInGeneralLesson(courseId, String(data.id));
  }

  return data as CourseMaterial;
};

const attachMaterialToLesson = async (
  courseId: string,
  lessonId: string,
  materialId: string
): Promise<void> => {
  const { data: lesson, error: lessonErr } = await supabaseAdmin
    .from('lessons')
    .select('id, course_id')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonErr || !lesson || (lesson as { course_id?: string }).course_id !== courseId) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Lesson does not belong to this course',
      400
    );
  }

  const { error: linkErr } = await supabaseAdmin
    .from('lesson_materials')
    .insert({
      lesson_id: lessonId,
      material_id: materialId,
      sort_order: 0,
    });
  if (linkErr && (linkErr as { code?: string }).code !== '23505') {
    logger.warn('Could not attach material to lesson', {
      courseId,
      lessonId,
      materialId,
      error: linkErr.message,
    });
  }
};

const ensureMaterialParkedInGeneralLesson = async (
  courseId: string,
  materialId: string
): Promise<void> => {
  const { data: existing } = await supabaseAdmin
    .from('lesson_materials')
    .select('lesson_id')
    .eq('material_id', materialId)
    .maybeSingle();
  if (existing) return;

  let { data: general } = await supabaseAdmin
    .from('lessons')
    .select('id')
    .eq('course_id', courseId)
    .eq('is_general', true)
    .maybeSingle();

  if (!general) {
    const { data: created, error: createErr } = await supabaseAdmin
      .from('lessons')
      .insert({
        course_id: courseId,
        title: 'General',
        description: 'Holds existing assignments and materials that were created before lessons. Split or rename as needed.',
        topics: [],
        sort_order: 9999,
        is_published: true,
        is_general: true,
        completion_rule_type: 'mark_as_done',
        completion_rule_min_minutes: null,
        next_lesson_id: null,
        unlock_on_submit: true,
        unlock_on_pass: false,
        pass_threshold_percent: null,
      })
      .select('id')
      .single();
    if (createErr || !created) return;
    general = created as { id: string };
  }

  const { error: linkErr } = await supabaseAdmin
    .from('lesson_materials')
    .insert({
      lesson_id: (general as { id: string }).id,
      material_id: materialId,
      sort_order: 0,
    });
  if (linkErr && (linkErr as { code?: string }).code !== '23505') {
    logger.warn('Could not park material in General lesson', {
      courseId,
      materialId,
      error: linkErr.message,
    });
  }
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

const persistMaterialProgressUpdate = async (
  current: MaterialProgress,
  materialId: string,
  userId: string,
  patch: Record<string, unknown>,
  errorContext: string
): Promise<MaterialProgress> => {
  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .update(patch)
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

    logger.error(errorContext, {
      materialId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update material progress', 500);
  }

  return data as MaterialProgress;
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

  return persistMaterialProgressUpdate(
    current,
    materialId,
    userId,
    {
      progress_percent: resolvedProgressPercent,
      completed: resolvedCompleted,
      last_viewed_at: input.last_viewed_at || nowIso,
      completed_at: resolvedCompleted ? current.completed_at || nowIso : null,
      updated_at: nowIso,
    },
    'Failed to update material progress'
  );
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

/**
 * Track material view start for the current student.
 */
export const trackMaterialViewStart = async (
  materialId: string,
  input: TrackMaterialViewStartInput,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgress> => {
  const current = await getMyMaterialProgress(materialId, userId, userRole);
  const nowIso = new Date().toISOString();
  const interactionEvents = upsertInteractionEvent(
    normalizeInteractionEvents(current.interaction_events),
    'view_start',
    (previousEvent) => {
      const previousData = previousEvent?.data || {};
      const firstOpenedAt = typeof previousData.first_opened_at === 'string'
        ? previousData.first_opened_at
        : previousEvent?.timestamp || nowIso;
      const previousOpenCount = Math.max(
        0,
        Math.floor(toFiniteNumber(previousData.open_count, previousEvent ? 1 : 0))
      );
      const persistedUserAgent = typeof previousData.user_agent === 'string'
        ? previousData.user_agent
        : null;
      const persistedDeviceType = typeof previousData.device_type === 'string'
        ? previousData.device_type
        : 'unknown';

      return {
        first_opened_at: firstOpenedAt,
        last_opened_at: nowIso,
        open_count: previousOpenCount + 1,
        user_agent: input.user_agent ?? persistedUserAgent,
        device_type: input.device_type ?? persistedDeviceType,
      };
    }
  );

  return persistMaterialProgressUpdate(
    current,
    materialId,
    userId,
    {
      last_viewed_at: nowIso,
      interaction_events: interactionEvents,
      updated_at: nowIso,
    },
    'Failed to track material view start'
  );
};

/**
 * Track in-session scroll/page progress for the current student.
 */
export const trackMaterialProgress = async (
  materialId: string,
  input: TrackMaterialProgressInput,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgress> => {
  const current = await getMyMaterialProgress(materialId, userId, userRole);
  const nowIso = new Date().toISOString();
  const scrollPercent = normalizePercent(input.scroll_percent);
  const progressPercent = Math.max(
    normalizePercent(toFiniteNumber(current.progress_percent, 0)),
    scrollPercent
  );

  const mergedPages = normalizePagesViewed([
    ...normalizePagesViewed(current.pages_viewed),
    ...normalizePagesViewed(input.pages_viewed),
    ...(typeof input.page_number === 'number' ? [input.page_number] : []),
  ]);

  const interactionEvents = upsertInteractionEvent(
    normalizeInteractionEvents(current.interaction_events),
    'scroll',
    (previousEvent) => {
      const previousData = previousEvent?.data || {};
      const previousScrollPercent = normalizePercent(
        toFiniteNumber(previousData.scroll_percent, 0)
      );
      const previousActiveSeconds = Math.max(
        0,
        Math.round(toFiniteNumber(previousData.active_seconds, 0))
      );
      const currentActiveSeconds = typeof input.active_seconds === 'number'
        ? Math.max(0, Math.round(input.active_seconds))
        : 0;
      const previousHeartbeatCount = Math.max(
        0,
        Math.floor(toFiniteNumber(previousData.heartbeat_count, previousEvent ? 1 : 0))
      );
      const previousPageNumber =
        typeof previousData.page_number === 'number'
          && Number.isInteger(previousData.page_number)
          && previousData.page_number > 0
          ? previousData.page_number
          : null;

      return {
        scroll_percent: Math.max(previousScrollPercent, scrollPercent),
        page_number: input.page_number ?? previousPageNumber,
        pages_viewed: mergedPages,
        active_seconds: previousActiveSeconds + currentActiveSeconds,
        heartbeat_count: previousHeartbeatCount + 1,
      };
    }
  );

  const resolvedCompleted = Boolean(current.completed) || progressPercent >= 100;

  return persistMaterialProgressUpdate(
    current,
    materialId,
    userId,
    {
      progress_percent: progressPercent,
      completed: resolvedCompleted,
      completed_at: resolvedCompleted ? current.completed_at || nowIso : null,
      current_scroll_position: scrollPercent,
      pages_viewed: mergedPages,
      interaction_events: interactionEvents,
      last_viewed_at: nowIso,
      updated_at: nowIso,
    },
    'Failed to track material progress'
  );
};

/**
 * Track material view end for the current student.
 */
export const trackMaterialViewEnd = async (
  materialId: string,
  input: TrackMaterialViewEndInput,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgress> => {
  const current = await getMyMaterialProgress(materialId, userId, userRole);
  const nowIso = new Date().toISOString();
  const finalScrollPercent = normalizePercent(input.final_scroll_percent);
  const progressPercent = Math.max(
    normalizePercent(toFiniteNumber(current.progress_percent, 0)),
    finalScrollPercent
  );
  const mergedPages = normalizePagesViewed([
    ...normalizePagesViewed(current.pages_viewed),
    ...(typeof input.page_number === 'number' ? [input.page_number] : []),
  ]);

  const interactionEvents = upsertInteractionEvent(
    normalizeInteractionEvents(current.interaction_events),
    'view_end',
    (previousEvent) => {
      const previousData = previousEvent?.data || {};
      const previousSessionCount = Math.max(
        0,
        Math.floor(toFiniteNumber(previousData.session_count, previousEvent ? 1 : 0))
      );
      const previousTotalSessionSeconds = Math.max(
        0,
        toFiniteNumber(
          previousData.total_time_spent_seconds,
          toFiniteNumber(previousData.time_spent_seconds, 0)
        )
      );
      const currentSessionSeconds = Math.max(0, Math.round(input.time_spent_seconds));
      const nextSessionCount = previousSessionCount + 1;
      const nextTotalSessionSeconds = previousTotalSessionSeconds + currentSessionSeconds;
      const previousPageNumber =
        typeof previousData.page_number === 'number'
          && Number.isInteger(previousData.page_number)
          && previousData.page_number > 0
          ? previousData.page_number
          : null;

      return {
        session_count: nextSessionCount,
        total_time_spent_seconds: nextTotalSessionSeconds,
        average_time_spent_seconds: Math.round((nextTotalSessionSeconds / nextSessionCount) * 100) / 100,
        time_spent_seconds: currentSessionSeconds,
        final_scroll_percent: finalScrollPercent,
        page_number: input.page_number ?? previousPageNumber,
        completed: Boolean(input.completed) || Boolean(previousData.completed),
      };
    }
  );

  const resolvedCompleted = Boolean(input.completed) || Boolean(current.completed) || progressPercent >= 100;

  return persistMaterialProgressUpdate(
    current,
    materialId,
    userId,
    {
      progress_percent: progressPercent,
      completed: resolvedCompleted,
      completed_at: resolvedCompleted ? current.completed_at || nowIso : null,
      current_scroll_position: finalScrollPercent,
      pages_viewed: mergedPages,
      interaction_events: interactionEvents,
      last_viewed_at: nowIso,
      updated_at: nowIso,
    },
    'Failed to track material view end'
  );
};

/**
 * Track material download for the current student.
 */
export const trackMaterialDownload = async (
  materialId: string,
  input: TrackMaterialDownloadInput,
  userId: string,
  userRole: UserRole
): Promise<MaterialProgress> => {
  const current = await getMyMaterialProgress(materialId, userId, userRole);
  const nowIso = new Date().toISOString();
  const nextDownloadCount = Math.max(0, Math.floor(toFiniteNumber(current.download_count, 0))) + 1;
  const interactionEvents = upsertInteractionEvent(
    normalizeInteractionEvents(current.interaction_events),
    'download',
    (previousEvent) => {
      const previousData = previousEvent?.data || {};
      const previousFileName = typeof previousData.file_name === 'string'
        ? previousData.file_name
        : null;
      const previousFileSize = typeof previousData.file_size === 'number' && Number.isFinite(previousData.file_size)
        ? previousData.file_size
        : null;

      return {
        file_name: input.file_name ?? previousFileName,
        file_size: typeof input.file_size === 'number' ? input.file_size : previousFileSize,
        download_count: nextDownloadCount,
      };
    }
  );

  return persistMaterialProgressUpdate(
    current,
    materialId,
    userId,
    {
      download_count: nextDownloadCount,
      interaction_events: interactionEvents,
      last_viewed_at: nowIso,
      updated_at: nowIso,
    },
    'Failed to track material download'
  );
};

/**
 * List per-student engagement analytics for a material (teacher/admin view).
 */
export const getMaterialEngagement = async (
  materialId: string,
  userId: string,
  userRole: UserRole
): Promise<MaterialEngagementSummary[]> => {
  if (userRole !== UserRole.ADMIN && userRole !== UserRole.TEACHER) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only teachers and admins can view material engagement analytics',
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
      download_count,
      current_scroll_position,
      pages_viewed,
      interaction_events,
      last_viewed_at,
      completed_at,
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

    logger.error('Failed to fetch material engagement analytics', {
      materialId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch material engagement analytics', 500);
  }

  return (data || []).map((rawRow) => {
    const row = fixMaterialProgressStudentJoin(rawRow);
    const interactionEvents = normalizeInteractionEvents(row.interaction_events);
    const pagesViewed = normalizePagesViewed(row.pages_viewed);
    const progressPercent = normalizePercent(toFiniteNumber(row.progress_percent, 0));
    const scrollPosition = normalizePercent(toFiniteNumber(row.current_scroll_position, 0));
    const downloadCount = Math.max(0, Math.floor(toFiniteNumber(row.download_count, 0)));
    const viewCount = countEventsByType(interactionEvents, 'view_start');
    const latestScrollEvent = interactionEvents.find((event) => event.type === 'scroll');
    const heartbeatCount = Math.max(
      0,
      Math.floor(
        toFiniteNumber(
          latestScrollEvent?.data?.heartbeat_count,
          countEventsByType(interactionEvents, 'scroll')
        )
      )
    );
    const latestViewEndEvent = interactionEvents.find((event) => event.type === 'view_end');
    const sessionCount = Math.max(
      0,
      Math.floor(
        toFiniteNumber(
          latestViewEndEvent?.data?.session_count,
          countEventsByType(interactionEvents, 'view_end')
        )
      )
    );
    const eventCount = viewCount + downloadCount + heartbeatCount + sessionCount;

    return {
      id: row.id,
      material_id: row.material_id,
      course_id: row.course_id,
      user_id: row.user_id,
      progress_percent: progressPercent,
      completed: Boolean(row.completed),
      download_count: downloadCount,
      current_scroll_position: scrollPosition,
      pages_viewed: pagesViewed,
      interaction_events: interactionEvents,
      event_count: eventCount,
      view_count: viewCount,
      avg_session_duration_seconds: computeAverageSessionDurationSeconds(interactionEvents),
      total_scan_seconds: computeTotalScanSeconds(interactionEvents),
      last_viewed_at: row.last_viewed_at,
      completed_at: row.completed_at,
      student: row.student,
    };
  });
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

// ============================================
// Course Insights (teacher analytics)
// ============================================

export interface PerStudentInsight {
  student: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  /** Most recent activity timestamp across submissions and material progress. */
  last_active_at: string | null;
  submissions_total: number;
  submissions_graded: number;
  /** assignments_total minus submissions_total, clamped to non-negative. */
  assignments_outstanding: number;
  materials_viewed: number;
  materials_total: number;
  /** Mean grade percentage across graded submissions, 0-100. Null when no graded work. */
  avg_grade_percent: number | null;
  /**
   * No activity in 7 days AND has at least one outstanding assignment.
   * Mirrors the "Nudge" trigger from the LMS workflow spec.
   */
  at_risk: boolean;
}

export interface ClassRollupInsight {
  student_count: number;
  assignment_count: number;
  material_count: number;
  /** Mean of per-student (submissions_total / assignment_count). 0-100. */
  avg_completion_percent: number;
  at_risk_count: number;
  /** Histogram bins: 0-59, 60-69, 70-79, 80-89, 90-100. */
  grade_distribution: Array<{ range: string; count: number }>;
}

export interface CourseInsightsPayload {
  course_id: string;
  generated_at: string;
  per_student: PerStudentInsight[];
  class_rollup: ClassRollupInsight;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const computeGradeBins = (percentages: number[]): Array<{ range: string; count: number }> => {
  const bins = [
    { range: '0-59', min: 0, max: 60, count: 0 },
    { range: '60-69', min: 60, max: 70, count: 0 },
    { range: '70-79', min: 70, max: 80, count: 0 },
    { range: '80-89', min: 80, max: 90, count: 0 },
    { range: '90-100', min: 90, max: 101, count: 0 },
  ];
  for (const p of percentages) {
    const bin = bins.find((b) => p >= b.min && p < b.max);
    if (bin) bin.count += 1;
  }
  return bins.map(({ range, count }) => ({ range, count }));
};

/**
 * Aggregated engagement + completion metrics for a single course. Replaces
 * what would otherwise be N per-material + per-student round-trips from the
 * teacher Insights tab. Read-only — no schema changes.
 */
export const getCourseInsights = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<CourseInsightsPayload> => {
  // Permission check (throws if not allowed to view this course).
  await getCourseById(courseId, false, userId, userRole);

  const [studentsResult, assignmentsResult, materialsResult, submissionsResult, progressResult] =
    await Promise.all([
      supabaseAdmin
        .from('enrollments')
        .select(`
          student:profiles!enrollments_student_id_fkey(
            id, email, first_name, last_name, avatar_url
          )
        `)
        .eq('course_id', courseId)
        .in('status', ACTIVE_ENROLLMENT_STATUSES),
      supabaseAdmin
        .from('assignments')
        .select('id, max_points')
        .eq('course_id', courseId),
      supabaseAdmin
        .from('course_materials')
        .select('id')
        .eq('course_id', courseId),
      supabaseAdmin
        .from('submissions')
        .select(`
          student_id,
          submitted_at,
          assignment:assignments!inner(course_id, max_points),
          grade:grades(points_earned)
        `)
        .eq('assignment.course_id', courseId),
      supabaseAdmin
        .from('material_progress')
        .select('user_id, material_id, completed, progress_percent, last_viewed_at')
        .eq('course_id', courseId),
    ]);

  for (const [label, result] of [
    ['students', studentsResult],
    ['assignments', assignmentsResult],
    ['materials', materialsResult],
    ['submissions', submissionsResult],
    ['progress', progressResult],
  ] as const) {
    if (result.error) {
      logger.error('Failed to load insights data', {
        courseId,
        label,
        error: result.error.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to compute course insights',
        500
      );
    }
  }

  // Deduplicate students (multiple enrollment rows can exist for re-joins).
  const studentMap = new Map<string, PerStudentInsight['student']>();
  for (const row of (studentsResult.data || []) as Array<{ student?: any }>) {
    const student = Array.isArray(row.student) ? row.student[0] : row.student;
    if (!student?.id || studentMap.has(student.id)) continue;
    studentMap.set(student.id, {
      id: student.id,
      email: student.email,
      first_name: student.first_name ?? null,
      last_name: student.last_name ?? null,
      avatar_url: student.avatar_url ?? null,
    });
  }

  const assignmentCount = (assignmentsResult.data || []).length;
  const materialCount = (materialsResult.data || []).length;

  type Bucket = {
    submissions_total: number;
    submissions_graded: number;
    grade_percentages: number[];
    materials_viewed: Set<string>;
    last_active_at: number;
  };
  const buckets = new Map<string, Bucket>();
  const ensureBucket = (sid: string): Bucket => {
    let bucket = buckets.get(sid);
    if (!bucket) {
      bucket = {
        submissions_total: 0,
        submissions_graded: 0,
        grade_percentages: [],
        materials_viewed: new Set<string>(),
        last_active_at: 0,
      };
      buckets.set(sid, bucket);
    }
    return bucket;
  };

  // Submissions → counts, grades, last activity.
  for (const row of (submissionsResult.data || []) as any[]) {
    const sid = row.student_id;
    if (!sid) continue;
    const bucket = ensureBucket(sid);
    bucket.submissions_total += 1;
    const submittedAt = new Date(row.submitted_at || 0).getTime();
    if (Number.isFinite(submittedAt) && submittedAt > bucket.last_active_at) {
      bucket.last_active_at = submittedAt;
    }
    const gradeRow = Array.isArray(row.grade) ? row.grade[0] : row.grade;
    const points = gradeRow?.points_earned;
    const assignment = Array.isArray(row.assignment) ? row.assignment[0] : row.assignment;
    const maxPoints = assignment?.max_points;
    if (typeof points === 'number' && typeof maxPoints === 'number' && maxPoints > 0) {
      bucket.submissions_graded += 1;
      bucket.grade_percentages.push((points / maxPoints) * 100);
    }
  }

  // Material progress → viewed count + last activity (counted once per material).
  for (const row of (progressResult.data || []) as any[]) {
    const sid = row.user_id;
    if (!sid) continue;
    const bucket = ensureBucket(sid);
    if (row.completed || (typeof row.progress_percent === 'number' && row.progress_percent > 0)) {
      bucket.materials_viewed.add(String(row.material_id ?? ''));
    }
    const viewedAt = new Date(row.last_viewed_at || 0).getTime();
    if (Number.isFinite(viewedAt) && viewedAt > bucket.last_active_at) {
      bucket.last_active_at = viewedAt;
    }
  }

  const now = Date.now();
  const perStudent: PerStudentInsight[] = [];

  for (const student of studentMap.values()) {
    const bucket = buckets.get(student.id);
    const submissionsTotal = bucket?.submissions_total ?? 0;
    const submissionsGraded = bucket?.submissions_graded ?? 0;
    const lastActiveMs = bucket?.last_active_at ?? 0;
    const outstanding = Math.max(0, assignmentCount - submissionsTotal);
    const inactiveTooLong = lastActiveMs === 0 || now - lastActiveMs >= SEVEN_DAYS_MS;
    const avgGrade =
      bucket && bucket.grade_percentages.length > 0
        ? bucket.grade_percentages.reduce((acc, n) => acc + n, 0) /
          bucket.grade_percentages.length
        : null;

    perStudent.push({
      student,
      last_active_at: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
      submissions_total: submissionsTotal,
      submissions_graded: submissionsGraded,
      assignments_outstanding: outstanding,
      materials_viewed: bucket?.materials_viewed.size ?? 0,
      materials_total: materialCount,
      avg_grade_percent: avgGrade !== null ? Math.round(avgGrade * 100) / 100 : null,
      at_risk: inactiveTooLong && outstanding > 0,
    });
  }

  perStudent.sort((a, b) => {
    const aName = `${a.student.last_name ?? ''} ${a.student.first_name ?? ''}`.trim();
    const bName = `${b.student.last_name ?? ''} ${b.student.first_name ?? ''}`.trim();
    return aName.localeCompare(bName);
  });

  const completionPercents = perStudent.map((row) => {
    if (assignmentCount === 0) return 0;
    return Math.min(100, (row.submissions_total / assignmentCount) * 100);
  });
  const avgCompletion =
    completionPercents.length > 0
      ? completionPercents.reduce((acc, n) => acc + n, 0) / completionPercents.length
      : 0;

  const allGradePercents: number[] = [];
  for (const row of perStudent) {
    if (row.avg_grade_percent !== null) {
      allGradePercents.push(row.avg_grade_percent);
    }
  }

  return {
    course_id: courseId,
    generated_at: new Date().toISOString(),
    per_student: perStudent,
    class_rollup: {
      student_count: perStudent.length,
      assignment_count: assignmentCount,
      material_count: materialCount,
      avg_completion_percent: Math.round(avgCompletion * 100) / 100,
      at_risk_count: perStudent.filter((r) => r.at_risk).length,
      grade_distribution: computeGradeBins(allGradePercents),
    },
  };
};
