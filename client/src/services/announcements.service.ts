import { apiClient } from './api-client';

export interface AnnouncementData {
  title: string;
  content: string;
  pinned?: boolean;
}

export interface Announcement {
  id: string;
  course_id: string;
  author_id: string;
  title: string;
  content: string;
  pinned: boolean;
  comments_count?: number;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface AnnouncementCommentAuthor {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role?: string;
  avatar_url: string | null;
}

export interface AnnouncementComment {
  id: string;
  announcement_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: AnnouncementCommentAuthor;
}

export interface AnnouncementCommentData {
  content: string;
}

export const announcementsService = {
  async getAnnouncements(courseId: string, params?: { limit?: number; offset?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const queryString = queryParams.toString();
    return apiClient.get<{ data: Announcement[]; meta: { total: number } }>(
      `/courses/${courseId}/announcements${queryString ? `?${queryString}` : ''}`
    );
  },

  async createAnnouncement(courseId: string, data: AnnouncementData) {
    return apiClient.post<Announcement>(`/courses/${courseId}/announcements`, data);
  },

  async getAnnouncement(announcementId: string) {
    return apiClient.get<Announcement>(`/announcements/${announcementId}`);
  },

  async getAnnouncementComments(announcementId: string) {
    return apiClient.get<{ data: AnnouncementComment[] }>(
      `/announcements/${announcementId}/comments`
    );
  },

  async createAnnouncementComment(
    announcementId: string,
    data: AnnouncementCommentData
  ) {
    return apiClient.post<{ data: AnnouncementComment }>(
      `/announcements/${announcementId}/comments`,
      data
    );
  },

  async updateAnnouncement(announcementId: string, data: Partial<AnnouncementData>) {
    return apiClient.patch<Announcement>(`/announcements/${announcementId}`, data);
  },

  async deleteAnnouncement(announcementId: string) {
    try {
      return await apiClient.delete(`/announcements/${announcementId}`);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return {
          success: true,
          alreadyDeleted: true,
        };
      }

      throw error;
    }
  },
};
