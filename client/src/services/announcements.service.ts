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
