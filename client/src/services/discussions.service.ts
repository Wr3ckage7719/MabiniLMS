import { apiClient } from './api-client';

export interface DiscussionAuthor {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface DiscussionPost {
  id: string;
  course_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  likes_count: number;
  liked_by_me: boolean;
  author: DiscussionAuthor;
}

export interface DiscussionPostData {
  content: string;
}

export const discussionsService = {
  async getDiscussionPosts(
    courseId: string,
    params?: { limit?: number; offset?: number }
  ) {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const queryString = queryParams.toString();

    return apiClient.get<{ data: DiscussionPost[]; meta: { total: number } }>(
      `/courses/${courseId}/discussions/posts${queryString ? `?${queryString}` : ''}`
    );
  },

  async createDiscussionPost(courseId: string, data: DiscussionPostData) {
    return apiClient.post<{ data: DiscussionPost }>(
      `/courses/${courseId}/discussions/posts`,
      data
    );
  },

  async toggleDiscussionPostLike(courseId: string, postId: string) {
    return apiClient.post<{ data: { post: DiscussionPost; liked: boolean } }>(
      `/courses/${courseId}/discussions/posts/${postId}/like`
    );
  },
};
