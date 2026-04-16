import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  CreateDiscussionPostInput,
  DiscussionPostWithAuthor,
  ListDiscussionPostsQuery,
} from '../types/discussions.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';
import { sendDiscussionPostNotification } from './notifications.js';
import logger from '../utils/logger.js';

const DISCUSSION_POST_SELECT_BASE = `
  id, course_id, author_id, content, created_at, updated_at,
  author:profiles!course_discussion_posts_author_id_fkey(id, email, first_name, last_name, avatar_url)
`;

type DiscussionAuthorRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type DiscussionPostJoinedRow = {
  id: string;
  course_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: DiscussionAuthorRow | DiscussionAuthorRow[] | null;
};

type DiscussionLikeRow = {
  post_id: string;
  user_id: string;
};

type CourseDiscussionAccessInfo = {
  course_id: string;
  teacher_id: string | null;
};

type DiscussionPostPermissionRow = {
  id: string;
  course_id: string;
  author_id: string;
  content: string;
};

type DiscussionModerationAction = 'hide' | 'delete';

const HIDDEN_DISCUSSION_POST_CONTENT = '[Hidden by teacher]';

const isHiddenDiscussionContent = (content: string): boolean => {
  return content.trim().toLowerCase() === HIDDEN_DISCUSSION_POST_CONTENT.toLowerCase();
};

const isMissingRelationError = (
  error?: { code?: string; message?: string } | null
): boolean => {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
};

const normalizeAuthor = (
  author: DiscussionAuthorRow | DiscussionAuthorRow[] | null
): DiscussionAuthorRow | null => {
  if (Array.isArray(author)) {
    return author[0] || null;
  }
  return author;
};

const toDiscussionPostWithAuthor = (
  row: DiscussionPostJoinedRow,
  likesCount: number,
  likedByMe: boolean
): DiscussionPostWithAuthor => {
  const author = normalizeAuthor(row.author);

  return {
    id: row.id,
    course_id: row.course_id,
    author_id: row.author_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    likes_count: likesCount,
    liked_by_me: likedByMe,
    is_hidden: isHiddenDiscussionContent(row.content),
    author: {
      id: author?.id || row.author_id,
      email: author?.email || '',
      first_name: author?.first_name || '',
      last_name: author?.last_name || '',
      avatar_url: author?.avatar_url || null,
    },
  };
};

const ensureCourseDiscussionAccess = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<CourseDiscussionAccessInfo> => {
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  const accessInfo: CourseDiscussionAccessInfo = {
    course_id: course.id,
    teacher_id: course.teacher_id || null,
  };

  if (userRole === UserRole.ADMIN || course.teacher_id === userId) {
    return accessInfo;
  }

  if (userRole === UserRole.STUDENT) {
    const { data: enrollment, error: enrollmentError } = await supabaseAdmin
      .from('enrollments')
      .select('id')
      .eq('course_id', courseId)
      .eq('student_id', userId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES)
      .maybeSingle();

    if (enrollmentError) {
      logger.error('Failed to verify enrollment for course discussion access', {
        courseId,
        userId,
        error: enrollmentError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate course access', 500);
    }

    if (enrollment) {
      return accessInfo;
    }
  }

  throw new ApiError(
    ErrorCode.FORBIDDEN,
    'You do not have access to this course discussion stream',
    403
  );
};

const getDiscussionPostPermissionRow = async (
  courseId: string,
  postId: string
): Promise<DiscussionPostPermissionRow> => {
  const { data: row, error } = await supabaseAdmin
    .from('course_discussion_posts')
    .select('id, course_id, author_id, content')
    .eq('id', postId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Discussion stream is not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to verify discussion post', {
      courseId,
      postId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to verify discussion post', 500);
  }

  if (!row) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Discussion post not found', 404);
  }

  return row as DiscussionPostPermissionRow;
};

const ensureDiscussionModerationPermission = (
  action: DiscussionModerationAction,
  userId: string,
  userRole: UserRole,
  courseAccess: CourseDiscussionAccessInfo,
  postAuthorId: string
): void => {
  const isAdmin = userRole === UserRole.ADMIN;
  const isTeacher = courseAccess.teacher_id === userId;
  const isAuthor = postAuthorId === userId;

  if (isAdmin || isTeacher || (action === 'delete' && isAuthor)) {
    return;
  }

  if (action === 'hide') {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only the course teacher can hide discussion posts',
      403
    );
  }

  throw new ApiError(
    ErrorCode.FORBIDDEN,
    'You are not allowed to remove this discussion post',
    403
  );
};

const getDiscussionPostById = async (
  postId: string,
  userId: string
): Promise<DiscussionPostWithAuthor> => {
  const { data: postRow, error: postError } = await supabaseAdmin
    .from('course_discussion_posts')
    .select(DISCUSSION_POST_SELECT_BASE)
    .eq('id', postId)
    .single();

  if (postError || !postRow) {
    if (postError?.code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Discussion post not found', 404);
    }

    logger.error('Failed to load discussion post', {
      postId,
      error: postError?.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load discussion post', 500);
  }

  const { data: likes, error: likesError } = await supabaseAdmin
    .from('course_discussion_post_likes')
    .select('post_id, user_id')
    .eq('post_id', postId);

  if (likesError) {
    if (!isMissingRelationError(likesError)) {
      logger.error('Failed to load discussion post likes', {
        postId,
        error: likesError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load discussion post likes', 500);
    }

    return toDiscussionPostWithAuthor(postRow as DiscussionPostJoinedRow, 0, false);
  }

  const likeRows = (likes || []) as DiscussionLikeRow[];
  const likesCount = likeRows.length;
  const likedByMe = likeRows.some((likeRow) => likeRow.user_id === userId);

  return toDiscussionPostWithAuthor(postRow as DiscussionPostJoinedRow, likesCount, likedByMe);
};

export const listDiscussionPosts = async (
  courseId: string,
  query: ListDiscussionPostsQuery,
  userId: string,
  userRole: UserRole
): Promise<{ posts: DiscussionPostWithAuthor[]; total: number }> => {
  await ensureCourseDiscussionAccess(courseId, userId, userRole);

  const { data, error, count } = await supabaseAdmin
    .from('course_discussion_posts')
    .select(DISCUSSION_POST_SELECT_BASE, { count: 'exact' })
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    if (isMissingRelationError(error)) {
      logger.warn('Course discussion tables missing. Returning empty stream list.', {
        courseId,
        error: error.message,
      });

      return {
        posts: [],
        total: 0,
      };
    }

    logger.error('Failed to list discussion posts', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load discussion posts', 500);
  }

  const postRows = (data || []) as DiscussionPostJoinedRow[];
  if (postRows.length === 0) {
    return {
      posts: [],
      total: count || 0,
    };
  }

  const postIds = postRows.map((row) => row.id);
  const { data: likes, error: likesError } = await supabaseAdmin
    .from('course_discussion_post_likes')
    .select('post_id, user_id')
    .in('post_id', postIds);

  if (likesError) {
    if (!isMissingRelationError(likesError)) {
      logger.error('Failed to list discussion post likes', {
        courseId,
        error: likesError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load discussion post likes', 500);
    }
  }

  const likesByPost = new Map<string, number>();
  const likedByMe = new Set<string>();

  ((likes || []) as DiscussionLikeRow[]).forEach((likeRow) => {
    likesByPost.set(likeRow.post_id, (likesByPost.get(likeRow.post_id) || 0) + 1);
    if (likeRow.user_id === userId) {
      likedByMe.add(likeRow.post_id);
    }
  });

  const posts = postRows.map((row) =>
    toDiscussionPostWithAuthor(
      row,
      likesByPost.get(row.id) || 0,
      likedByMe.has(row.id)
    )
  );

  return {
    posts,
    total: count || 0,
  };
};

export const createDiscussionPost = async (
  courseId: string,
  input: CreateDiscussionPostInput,
  userId: string,
  userRole: UserRole
): Promise<DiscussionPostWithAuthor> => {
  await ensureCourseDiscussionAccess(courseId, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('course_discussion_posts')
    .insert({
      course_id: courseId,
      author_id: userId,
      content: input.content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(DISCUSSION_POST_SELECT_BASE)
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Discussion stream is not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to create discussion post', {
      courseId,
      userId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create discussion post', 500);
  }

  try {
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id, title, teacher_id')
      .eq('id', courseId)
      .maybeSingle();

    if (courseError || !course) {
      logger.warn('Failed to resolve discussion notification course details', {
        courseId,
        userId,
        error: courseError?.message || 'Course not found',
      });
    } else {
      const { data: enrollments, error: enrollmentError } = await supabaseAdmin
        .from('enrollments')
        .select('student_id')
        .eq('course_id', courseId)
        .in('status', ACTIVE_ENROLLMENT_STATUSES);

      if (enrollmentError) {
        logger.warn('Failed to resolve discussion notification recipients', {
          courseId,
          userId,
          error: enrollmentError.message,
        });
      } else {
        const recipientIds = new Set<string>();

        (enrollments || []).forEach((enrollment) => {
          if (enrollment.student_id && enrollment.student_id !== userId) {
            recipientIds.add(enrollment.student_id);
          }
        });

        if (course.teacher_id && course.teacher_id !== userId) {
          recipientIds.add(course.teacher_id);
        }

        const author = normalizeAuthor((data as DiscussionPostJoinedRow).author);
        const authorDisplayName =
          [author?.first_name, author?.last_name].filter(Boolean).join(' ').trim() ||
          author?.email ||
          'A classmate';

        await sendDiscussionPostNotification(
          Array.from(recipientIds),
          course.title || 'Course',
          courseId,
          authorDisplayName
        );
      }
    }
  } catch (notificationError) {
    logger.warn('Failed to dispatch discussion post notifications', {
      courseId,
      userId,
      error:
        notificationError instanceof Error
          ? notificationError.message
          : String(notificationError),
    });
  }

  return toDiscussionPostWithAuthor(data as DiscussionPostJoinedRow, 0, false);
};

export const toggleDiscussionPostLike = async (
  courseId: string,
  postId: string,
  userId: string,
  userRole: UserRole
): Promise<{ post: DiscussionPostWithAuthor; liked: boolean }> => {
  await ensureCourseDiscussionAccess(courseId, userId, userRole);

  const { data: existingPost, error: postLookupError } = await supabaseAdmin
    .from('course_discussion_posts')
    .select('id, course_id')
    .eq('id', postId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (postLookupError) {
    if (isMissingRelationError(postLookupError)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Discussion stream is not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to verify discussion post before like toggle', {
      postId,
      courseId,
      error: postLookupError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update post reaction', 500);
  }

  if (!existingPost) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Discussion post not found', 404);
  }

  const { data: existingLike, error: likeLookupError } = await supabaseAdmin
    .from('course_discussion_post_likes')
    .select('post_id, user_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (likeLookupError) {
    if (isMissingRelationError(likeLookupError)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Discussion reactions are not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to verify existing discussion like', {
      postId,
      userId,
      error: likeLookupError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update post reaction', 500);
  }

  let liked = false;

  if (existingLike) {
    const { error: unlikeError } = await supabaseAdmin
      .from('course_discussion_post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (unlikeError) {
      logger.error('Failed to remove discussion post like', {
        postId,
        userId,
        error: unlikeError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update post reaction', 500);
    }
  } else {
    const { error: likeError } = await supabaseAdmin
      .from('course_discussion_post_likes')
      .insert({
        post_id: postId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });

    if (likeError) {
      logger.error('Failed to add discussion post like', {
        postId,
        userId,
        error: likeError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update post reaction', 500);
    }

    liked = true;
  }

  const post = await getDiscussionPostById(postId, userId);
  return { post, liked };
};

export const hideDiscussionPost = async (
  courseId: string,
  postId: string,
  userId: string,
  userRole: UserRole
): Promise<DiscussionPostWithAuthor> => {
  const courseAccess = await ensureCourseDiscussionAccess(courseId, userId, userRole);
  const postRow = await getDiscussionPostPermissionRow(courseId, postId);

  ensureDiscussionModerationPermission(
    'hide',
    userId,
    userRole,
    courseAccess,
    postRow.author_id
  );

  if (isHiddenDiscussionContent(postRow.content)) {
    return getDiscussionPostById(postId, userId);
  }

  const { error: updateError } = await supabaseAdmin
    .from('course_discussion_posts')
    .update({
      content: HIDDEN_DISCUSSION_POST_CONTENT,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('course_id', courseId);

  if (updateError) {
    if (isMissingRelationError(updateError)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Discussion stream is not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to hide discussion post', {
      courseId,
      postId,
      userId,
      error: updateError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to hide discussion post', 500);
  }

  const { error: clearLikesError } = await supabaseAdmin
    .from('course_discussion_post_likes')
    .delete()
    .eq('post_id', postId);

  if (clearLikesError && !isMissingRelationError(clearLikesError)) {
    logger.warn('Failed to clear likes for hidden discussion post', {
      courseId,
      postId,
      userId,
      error: clearLikesError.message,
    });
  }

  return getDiscussionPostById(postId, userId);
};

export const deleteDiscussionPost = async (
  courseId: string,
  postId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  const courseAccess = await ensureCourseDiscussionAccess(courseId, userId, userRole);
  const postRow = await getDiscussionPostPermissionRow(courseId, postId);

  ensureDiscussionModerationPermission(
    'delete',
    userId,
    userRole,
    courseAccess,
    postRow.author_id
  );

  const { error: deleteError } = await supabaseAdmin
    .from('course_discussion_posts')
    .delete()
    .eq('id', postId)
    .eq('course_id', courseId);

  if (deleteError) {
    if (isMissingRelationError(deleteError)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Discussion stream is not available yet. Please run the latest database migrations.',
        503
      );
    }

    logger.error('Failed to delete discussion post', {
      courseId,
      postId,
      userId,
      error: deleteError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete discussion post', 500);
  }
};
