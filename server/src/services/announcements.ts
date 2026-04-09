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
import logger from '../utils/logger.js';

// Helper to fix nested Supabase join arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixAuthorJoin = (data: any): AnnouncementWithAuthor => {
  if (!data) return data;
  return {
    ...data,
    author: Array.isArray(data.author) ? data.author[0] || null : data.author
  };
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
    .select(`
      id, course_id, author_id, title, content, pinned, created_at, updated_at,
      author:profiles!announcements_author_id_fkey(id, email, first_name, last_name, avatar_url)
    `)
    .single();

  if (error) {
    logger.error('Failed to create announcement', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create announcement', 500);
  }

  await notifyAnnouncementCreated(courseId, {
    id: data.id,
    title: data.title,
    courseName: course.title || 'Course',
  });

  logger.info('Announcement created', { announcementId: data.id, courseId, authorId });
  return fixAuthorJoin(data);
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
    .select(`
      id, course_id, author_id, title, content, pinned, created_at, updated_at,
      author:profiles!announcements_author_id_fkey(id, email, first_name, last_name, avatar_url)
    `, { count: 'exact' })
    .eq('course_id', courseId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    logger.error('Failed to list announcements', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list announcements', 500);
  }

  return {
    announcements: (data || []).map(fixAuthorJoin),
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
    .select(`
      id, course_id, author_id, title, content, pinned, created_at, updated_at,
      author:profiles!announcements_author_id_fkey(id, email, first_name, last_name, avatar_url)
    `)
    .eq('id', announcementId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Announcement not found', 404);
    }
    logger.error('Failed to get announcement', { announcementId, error: error?.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get announcement', 500);
  }

  return fixAuthorJoin(data);
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
    .select(`
      id, course_id, author_id, title, content, pinned, created_at, updated_at,
      author:profiles!announcements_author_id_fkey(id, email, first_name, last_name, avatar_url)
    `)
    .single();

  if (error) {
    logger.error('Failed to update announcement', { announcementId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update announcement', 500);
  }

  logger.info('Announcement updated', { announcementId, userId });
  return fixAuthorJoin(data);
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
