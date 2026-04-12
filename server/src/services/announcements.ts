/**
 * Announcements Service
 * 
 * Business logic for course announcements.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  AnnouncementWithAuthor,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  ListAnnouncementsQuery,
} from '../types/announcements.js';
import { notifyAnnouncementCreated } from './websocket.js';
import { sendAnnouncementNotification } from './notifications.js';
import logger from '../utils/logger.js';

const ANNOUNCEMENT_SELECT_BASE =
  'id, course_id, author_id, title, content, pinned, created_at, updated_at';

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

const isMissingRelationError = (error?: { code?: string; message?: string } | null): boolean => {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
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

const enrichAnnouncementsWithAuthors = async (
  rows: AnnouncementRow[]
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
    author: toAnnouncementAuthor(row.author_id, authorMap.get(row.author_id)),
  }));
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

  const { data, error } = await supabaseAdmin
    .from('announcements')
    .insert({
      course_id: courseId,
      author_id: authorId,
      title: input.title,
      content: input.content,
      pinned: input.pinned || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(ANNOUNCEMENT_SELECT_BASE)
    .single();

  if (error) {
    logger.error('Failed to create announcement', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create announcement', 500);
  }

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
      .eq('status', 'active');

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

  const announcements = await enrichAnnouncementsWithAuthors((data || []) as AnnouncementRow[]);

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

  const [announcement] = await enrichAnnouncementsWithAuthors([data as AnnouncementRow]);
  return announcement;
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
