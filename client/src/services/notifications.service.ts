import { apiClient } from './api-client';

export interface NotificationQuery {
  read?: boolean;
  limit?: number;
  offset?: number;
}

export const notificationsService = {
  list(params?: NotificationQuery) {
    const query = new URLSearchParams();
    if (typeof params?.read === 'boolean') query.append('read', String(params.read));
    if (typeof params?.limit === 'number') query.append('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.append('offset', String(params.offset));
    const queryString = query.toString();
    return apiClient.get(`/notifications${queryString ? `?${queryString}` : ''}`);
  },

  count() {
    return apiClient.get('/notifications/count');
  },

  markRead(notificationIds: string[]) {
    return apiClient.post('/notifications/mark-read', { notification_ids: notificationIds });
  },

  markAllRead() {
    return apiClient.post('/notifications/mark-all-read');
  },

  deleteRead() {
    return apiClient.delete('/notifications/delete-read');
  },

  getById(notificationId: string) {
    return apiClient.get(`/notifications/${notificationId}`);
  },

  markSingleRead(notificationId: string) {
    return apiClient.patch(`/notifications/${notificationId}/read`, {});
  },

  markSingleUnread(notificationId: string) {
    return apiClient.patch(`/notifications/${notificationId}/unread`, {});
  },

  deleteOne(notificationId: string) {
    return apiClient.delete(`/notifications/${notificationId}`);
  },
};
