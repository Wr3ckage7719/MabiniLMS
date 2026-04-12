import { z } from 'zod';

export const createDiscussionPostSchema = z.object({
  content: z.string().trim().min(1, 'Post content is required').max(5000),
});

export const courseDiscussionPostsParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

export const discussionPostParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  postId: z.string().uuid('Invalid post ID'),
});

export const discussionPostLikeParamSchema = discussionPostParamSchema;

export const listDiscussionPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateDiscussionPostInput = z.infer<typeof createDiscussionPostSchema>;
export type ListDiscussionPostsQuery = z.infer<typeof listDiscussionPostsQuerySchema>;

export interface DiscussionPost {
  id: string;
  course_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DiscussionPostWithAuthor extends DiscussionPost {
  author: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  likes_count: number;
  liked_by_me: boolean;
  is_hidden: boolean;
}
