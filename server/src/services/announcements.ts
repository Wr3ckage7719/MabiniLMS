/**
 * Announcements Service
 * 
 * Business logic for course announcements.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  AnnouncementCommentWithAuthor,
  AnnouncementWithAuthor,
  CreateAnnouncementCommentInput,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  ListAnnouncementsQuery,
} from '../types/announcements.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';
import { notifyAnnouncementCreated } from './websocket.js';
import { sendAnnouncementNotification } from './notifications.js';
import logger from '../utils/logger.js';

const ANNOUNCEMENT_SELECT_BASE =
  'id, course_id, author_id, title, content, pinned, created_at, updated_at';

const ANNOUNCEMENT_COMMENT_SELECT_BASE = `
  id, announcement_id, author_id, content, created_at, updated_at,
  author:profiles!announcement_comments_author_id_fkey(id, email, first_name, last_name, role, avatar_url)
`;

type AnnouncementRow = {
  id: string;
  course_id: string;
  author_id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type AuthorRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type AnnouncementCommentCountRow = {
  announcement_id: string;
};

type AnnouncementCommentAuthorRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  avatar_url: string | null;
};

type AnnouncementCommentJoinedRow = {
  id: string;
  announcement_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: AnnouncementCommentAuthorRow | AnnouncementCommentAuthorRow[] | null;
};

type DatabaseErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const ANNOUNCEMENT_INSERT_SELECT_COLUMNS = [
  'id',
  'course_id',
  'author_id',
  'title',
  'content',
  'pinned',
  'created_at',
  'updated_at',
];

const ANNOUNCEMENT_COMPAT_OPTIONAL_COLUMNS = new Set<string>([
  'pinned',
  'created_at',
  'updated_at',
]);

const normalizeDbErrorText = (error?: DatabaseErrorShape | null): string => {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const isMissingRelationError = (error?: DatabaseErrorShape | null): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
};

const extractMissingColumnName = (error?: DatabaseErrorShape | null): string | null => {
  const message = normalizeDbErrorText(error);
  const match = message.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i);
  return match?.[1] || null;
};

const isPermissionDeniedError = (error?: DatabaseErrorShape | null): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security')
  );
};

const toAnnouncementAuthor = (
  authorId: string,
  authorData?: AuthorRow
): AnnouncementWithAuthor['author'] => ({
  id: authorId,
  email: authorData?.email || '',
  first_name: authorData?.first_name || '',
  last_name: authorData?.last_name || '',
  avatar_url: authorData?.avatar_url || null,
});

const normalizeAnnouncementCommentAuthor = (
  author: AnnouncementCommentAuthorRow | AnnouncementCommentAuthorRow[] | null
): AnnouncementCommentAuthorRow | null => {
  if (Array.isArray(author)) {
    return author[0] || null;
  }

  return author;
};

const toAnnouncementCommentWithAuthor = (
  row: AnnouncementCommentJoinedRow
): AnnouncementCommentWithAuthor => {
  const author = normalizeAnnouncementCommentAuthor(row.author);

  return {
    id: row.id,
    announcement_id: row.announcement_id,
    author_id: row.author_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: {
      id: author?.id || row.author_id,
      email: author?.email || '',
      first_name: author?.first_name || '',
      last_name: author?.last_name || '',
      role: author?.role || undefined,
      avatar_url: author?.avatar_url || null,
    },
  };
};

const loadAnnouncementCommentCounts = async (
  announcementIds: string[],
  options: { throwOnMissingRelation?: boolean } = {}
): Promise<Map<string, number>> => {
  if (announcementIds.length === 0) {
    return new Map<string, number>();
  }

  const { data, error } = await supabaseAdmin
    .from('announcement_comments')
    .select('announcement_id')
    .in('announcement_id', announcementIds);

  if (error) {
    if (isMissingRelationError(error)) {
      if (options.throwOnMissingRelation) {
        throw new ApiError(
          ErrorCode.INTERNAL_ERROR,
          'Announcement comments are not available yet. Please run the latest database migrations.',
          503
        );
      }

      logger.warn('Announcement comments table missing. Falling back to zero comment counts.', {
        announcementIds,
        error: error.message,
      });

      return new Map<string, number>();
    }

    logger.error('Failed to load announcement comment counts', {
      announcementIds,
      error: error.message,
    });

    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load announcement comments', 500);
  }

  const countsByAnnouncementId = new Map<string, number>();

  ((data || []) as AnnouncementCommentCountRow[]).forEach((row) => {
    countsByAnnouncementId.set(
      row.announcement_id,
      (countsByAnnouncementId.get(row.announcement_id) || 0) + 1
    );
  });

  return countsByAnnouncementId;
};

const enrichAnnouncementsWithAuthors = async (
  rows: AnnouncementRow[],
  commentsCountByAnnouncementId: Map<string, number> = new Map<string, number>()
): Promise<AnnouncementWithAuthor[]> => {
  if (rows.length === 0) {
    return [];
  }

  const authorIds = Array.from(new Set(rows.map((row) => row.author_id).filter(Boolean)));
  let authorMap = new Map<string, AuthorRow>();

  if (authorIds.length > 0) {
    const { data: authors, error: authorsError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, avatar_url')
      .in('id', authorIds);

    if (authorsError) {
      logger.warn('Failed to load announcement author profiles', { error: authorsError.message });
    } else {
      authorMap = new Map((authors || []).map((author) => [author.id, author as AuthorRow]));
    }
  }

  return rows.map((row) => ({
    ...row,
    comments_count: commentsCountByAnnouncementId.get(row.id) || 0,
    author: toAnnouncementAuthor(row.author_id, authorMap.get(row.author_id)),
  }));
};

const insertAnnouncementWithCompatibility = async (
  payload: Record<string, unknown>
): Promise<{ data: Partial<AnnouncementRow> | null; error: DatabaseErrorShape | null }> => {
  const insertPayload: Record<string, unknown> = { ...payload };
  const selectColumns = [...ANNOUNCEMENT_INSERT_SELECT_COLUMNS];
  let lastError: DatabaseErrorShape | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert(insertPayload)
      .select(selectColumns.join(', '))
      .single();

    if (!error) {
      return {
        data: data as Partial<AnnouncementRow>,
        error: null,
      };
    }

    lastError = error;
    const missingColumn = extractMissingColumnName(error);

    if (
      missingColumn &&
      ANNOUNCEMENT_COMPAT_OPTIONAL_COLUMNS.has(missingColumn) &&
      Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)
    ) {
      delete insertPayload[missingColumn];

      const selectColumnIndex = selectColumns.indexOf(missingColumn);
      if (selectColumnIndex >= 0) {
        selectColumns.splice(selectColumnIndex, 1);
      }

      logger.warn('Retrying announcement insert without optional column', {
        missingColumn,
        attempt: attempt + 1,
        error: error.message,
      });
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: lastError };
};

/**
 * Create an announcement for a course
 */
export const createAnnouncement = async (
  courseId: string,
  input: CreateAnnouncementInput,
  authorId: string,
  authorRole: UserRole
): Promise<AnnouncementWithAuthor> => {
  // Verify course exists and user has permission
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, title, teacher_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  // Only course teacher or admin can create announcements
  if (authorRole !== UserRole.ADMIN && course.teacher_id !== authorId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only create announcements for your own courses',
      403
    );
  }

  const nowIso = new Date().toISOString();
  const { data: insertedAnnouncement, error } = await insertAnnouncementWithCompatibility({
    course_id: courseId,
    author_id: authorId,
    title: input.title,
    content: input.content,
    pinned: input.pinned || false,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (error || !insertedAnnouncement?.id) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Announcement storage is not available. Run migration 008_announcements and re-apply latest migrations.',
        503,
        {
          reason: 'ANNOUNCEMENTS_SCHEMA_OUTDATED',
          db_code: error?.code,
          db_message: error?.message,
        }
      );
    }

    if (isPermissionDeniedError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Database permission denied while creating announcements. Verify SUPABASE_SERVICE_KEY uses the service role key.',
        503,
        {
          reason: 'SUPABASE_PERMISSION_DENIED',
          db_code: error?.code,
          db_message: error?.message,
        }
      );
    }

    logger.error('Failed to create announcement', { courseId, error: error?.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create announcement', 500, {
      reason: 'ANNOUNCEMENT_INSERT_FAILED',
      db_code: error?.code,
      db_message: error?.message,
    });
  }

  const data: AnnouncementRow = {
    id: String(insertedAnnouncement.id),
    course_id: String(insertedAnnouncement.course_id || courseId),
    author_id: String(insertedAnnouncement.author_id || authorId),
    title: String(insertedAnnouncement.title || input.title),
    content: String(insertedAnnouncement.content || input.content),
    pinned:
      typeof insertedAnnouncement.pinned === 'boolean'
        ? insertedAnnouncement.pinned
        : Boolean(input.pinned),
    created_at:
      typeof insertedAnnouncement.created_at === 'string'
        ? insertedAnnouncement.created_at
        : nowIso,
    updated_at:
      typeof insertedAnnouncement.updated_at === 'string'
        ? insertedAnnouncement.updated_at
        : typeof insertedAnnouncement.created_at === 'string'
          ? insertedAnnouncement.created_at
          : nowIso,
  };

  await notifyAnnouncementCreated(courseId, {
    id: data.id,
    title: data.title,
    courseId,
    courseName: course.title || 'Course',
  });

  try {
    let notificationActor:
      | {
          id: string;
          name?: string;
          avatar_url?: string | null;
        }
      | undefined;

    const { data: authorProfile, error: authorProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, avatar_url')
      .eq('id', authorId)
      .maybeSingle();

    if (authorProfileError) {
      logger.warn('Failed to resolve announcement notification actor profile', {
        courseId,
        announcementId: data.id,
        authorId,
        error: authorProfileError.message,
      });
    } else if (authorProfile?.id) {
      const firstName = authorProfile.first_name?.trim() || '';
      const lastName = authorProfile.last_name?.trim() || '';
      const displayName = `${firstName} ${lastName}`.trim() || authorProfile.email || 'Instructor';

      notificationActor = {
        id: authorProfile.id,
        name: displayName,
        avatar_url: authorProfile.avatar_url || null,
      };
    }

    const { data: enrollments, error: enrollmentError } = await supabaseAdmin
      .from('enrollments')
      .select('student_id')
      .eq('course_id', courseId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES);

    if (enrollmentError) {
      logger.warn('Failed to load course recipients for announcement notifications', {
        courseId,
        announcementId: data.id,
        error: enrollmentError.message,
      });
    } else {
      const recipientIds = new Set<string>();

      (enrollments || []).forEach((enrollment) => {
        if (enrollment.student_id && enrollment.student_id !== authorId) {
          recipientIds.add(enrollment.student_id);
        }
      });

      if (course.teacher_id && course.teacher_id !== authorId) {
        recipientIds.add(course.teacher_id);
      }

      await sendAnnouncementNotification(
        Array.from(recipientIds),
        course.title || 'Course',
        courseId,
        data.title,
        notificationActor
      );
    }
  } catch (notificationError) {
    logger.warn('Failed to dispatch announcement notifications', {
      courseId,
      announcementId: data.id,
      error:
        notificationError instanceof Error
          ? notificationError.message
          : String(notificationError),
    });
  }

  logger.info('Announcement created', { announcementId: data.id, courseId, authorId });
  const [announcement] = await enrichAnnouncementsWithAuthors([data as AnnouncementRow]);
  return announcement;
};

/**
 * List announcements for a course
 */
export const listAnnouncements = async (
  courseId: string,
  query: ListAnnouncementsQuery
): Promise<{ announcements: AnnouncementWithAuthor[]; total: number }> => {
  // Verify course exists
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  const { data, error, count } = await supabaseAdmin
    .from('announcements')
    .select(ANNOUNCEMENT_SELECT_BASE, { count: 'exact' })
    .eq('course_id', courseId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    if (isMissingRelationError(error)) {
      logger.warn('Announcements table missing. Returning empty announcement list.', {
        courseId,
        error: error.message,
      });

      return {
        announcements: [],
        total: 0,
      };
    }

    logger.error('Failed to list announcements', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list announcements', 500);
  }

  const announcementRows = (data || []) as AnnouncementRow[];
  const commentsCountByAnnouncementId = await loadAnnouncementCommentCounts(
    announcementRows.map((row) => row.id)
  );
  const announcements = await enrichAnnouncementsWithAuthors(
    announcementRows,
    commentsCountByAnnouncementId
  );

  return {
    announcements,
    total: count || 0,
  };
};

/**
 * Get announcement by ID
 */
export const getAnnouncementById = async (
  announcementId: string
): Promise<AnnouncementWithAuthor> => {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .select(ANNOUNCEMENT_SELECT_BASE)
    .eq('id', announcementId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Announcement not found', 404);
    }
    logger.error('Failed to get announcement', { announcementId, error: error?.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get announcement', 500);
  }

  const commentsCountByAnnouncementId = await loadAnnouncementCommentCounts([announcementId]);
  const [announcement] = await enrichAnnouncementsWithAuthors(
    [data as AnnouncementRow],
    commentsCountByAnnouncementId
  );
  return announcement;
};

const ensureAnnouncementCommentAccess = async (
  announcementId: string,
  userId: string,
  userRole: UserRole
): Promise<AnnouncementWithAuthor> => {
  const announcement = await getAnnouncementById(announcementId);

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', announcement.course_id)
    .maybeSingle();

  if (courseError) {
    logger.error('Failed to verify course for announcement comments access', {
      announcementId,
      userId,
      error: courseError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate announcement access', 500);
  }

  if (!course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  if (
    userRole === UserRole.ADMIN ||
    course.teacher_id === userId ||
    announcement.author_id === userId
  ) {
    return announcement;
  }

  if (userRole === UserRole.STUDENT) {
    const { data: enrollmentRows, error: enrollmentError } = await supabaseAdmin
      .from('enrollments')
      .select('id')
      .eq('course_id', announcement.course_id)
      .eq('student_id', userId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES)
      .limit(1);

    if (enrollmentError) {
      logger.error('Failed to verify enrollment for announcement comments', {
        announcementId,
        userId,
        error: enrollmentError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate announcement access', 500);
    }

    if (Array.isArray(enrollmentRows) && enrollmentRows.length > 0) {
      return announcement;
    }
  }

  throw new ApiError(
    ErrorCode.FORBIDDEN,
    'You do not have access to comments for this announcement',
    403
  );
};

export const listAnnouncementComments = async (
  announcementId: string,
  userId: string,
  userRole: UserRole
): Promise<AnnouncementCommentWithAuthor[]> => {
  await ensureAnnouncementCommentAccess(announcementId, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('announcement_comments')
    .select(ANNOUNCEMENT_COMMENT_SELECT_BASE)
    .eq('announcement_id', announcementId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Announcement comments are not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to list announcement comments', {
      announcementId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load announcement comments', 500);
  }

  return ((data || []) as AnnouncementCommentJoinedRow[]).map(toAnnouncementCommentWithAuthor);
};

export const createAnnouncementComment = async (
  announcementId: string,
  input: CreateAnnouncementCommentInput,
  userId: string,
  userRole: UserRole
): Promise<AnnouncementCommentWithAuthor> => {
  await ensureAnnouncementCommentAccess(announcementId, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('announcement_comments')
    .insert({
      announcement_id: announcementId,
      author_id: userId,
      content: input.content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(ANNOUNCEMENT_COMMENT_SELECT_BASE)
    .single();

  if (error || !data) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Announcement comments are not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to create announcement comment', {
      announcementId,
      userId,
      error: error?.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create announcement comment', 500);
  }

  return toAnnouncementCommentWithAuthor(data as AnnouncementCommentJoinedRow);
};

/**
 * Update an announcement
 */
export const updateAnnouncement = async (
  announcementId: string,
  input: UpdateAnnouncementInput,
  userId: string,
  userRole: UserRole
): Promise<AnnouncementWithAuthor> => {
  const announcement = await getAnnouncementById(announcementId);

  // Verify permission - must be author or admin
  if (userRole !== UserRole.ADMIN && announcement.author_id !== userId) {
    // Check if user is the course teacher
    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('teacher_id')
      .eq('id', announcement.course_id)
      .single();

    if (!course || course.teacher_id !== userId) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'You can only update your own announcements',
        403
      );
    }
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
    .from('announcements')
    .update(updateData)
    .eq('id', announcementId)
    .select(ANNOUNCEMENT_SELECT_BASE)
    .single();

  if (error) {
    logger.error('Failed to update announcement', { announcementId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update announcement', 500);
  }

  logger.info('Announcement updated', { announcementId, userId });
  const [updatedAnnouncement] = await enrichAnnouncementsWithAuthors([data as AnnouncementRow]);
  return updatedAnnouncement;
};

/**
 * Delete an announcement
 */
export const deleteAnnouncement = async (
  announcementId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  const announcement = await getAnnouncementById(announcementId);

  // Verify permission - must be author, course teacher, or admin
  if (userRole !== UserRole.ADMIN && announcement.author_id !== userId) {
    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('teacher_id')
      .eq('id', announcement.course_id)
      .single();

    if (!course || course.teacher_id !== userId) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'You can only delete your own announcements',
        403
      );
    }
  }

  const { error } = await supabaseAdmin
    .from('announcements')
    .delete()
    .eq('id', announcementId);

  if (error) {
    logger.error('Failed to delete announcement', { announcementId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete announcement', 500);
  }

  logger.info('Announcement deleted', { announcementId, userId });
};
