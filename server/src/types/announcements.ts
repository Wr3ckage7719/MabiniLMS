import { z } from 'zod';

// Announcement schemas
export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  pinned: z.boolean().optional().default(false),
});

export const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  pinned: z.boolean().optional(),
});

export const announcementIdParamSchema = z.object({
  id: z.string().uuid('Invalid announcement ID'),
});

export const courseAnnouncementsParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

export const listAnnouncementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createAnnouncementCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment content is required').max(5000),
});

export const announcementCommentsParamSchema = z.object({
  id: z.string().uuid('Invalid announcement ID'),
});

// TypeScript types
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type CreateAnnouncementCommentInput = z.infer<typeof createAnnouncementCommentSchema>;

export interface Announcement {
  id: string;
  course_id: string;
  author_id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementWithAuthor extends Announcement {
  comments_count: number;
  author: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface AnnouncementComment {
  id: string;
  announcement_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementCommentWithAuthor extends AnnouncementComment {
  author: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role?: string;
    avatar_url: string | null;
  };
}
