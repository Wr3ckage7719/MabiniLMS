import { apiClient } from './api-client';

export interface UpdateProfileData {
  full_name?: string;
  bio?: string;
  avatar_url?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export const usersService = {
  async getProfile() {
    return apiClient.get('/users/me');
  },

  async updateProfile(data: UpdateProfileData) {
    return apiClient.patch('/users/me', data);
  },

  async changePassword(data: ChangePasswordData) {
    return apiClient.post('/users/me/change-password', data);
  },

  async getUserById(userId: string) {
    return apiClient.get(`/users/${userId}`);
  },

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiClient.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async searchUsers(query: string, role?: 'student' | 'teacher') {
    const params = new URLSearchParams({ q: query });
    if (role) params.append('role', role);
    return apiClient.get(`/users/search?${params.toString()}`);
  },
};
