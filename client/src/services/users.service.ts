import { apiClient } from './api-client';

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  full_name?: string;
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
    let first_name = data.first_name;
    let last_name = data.last_name;

    if (!first_name && !last_name && data.full_name) {
      const [firstToken, ...restTokens] = data.full_name.trim().split(' ').filter(Boolean);
      first_name = firstToken;
      last_name = restTokens.join(' ');
    }

    return apiClient.patch('/users/me', {
      first_name,
      last_name,
      avatar_url: data.avatar_url,
    });
  },

  async changePassword(data: ChangePasswordData) {
    return apiClient.post('/auth/change-password', data);
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
    return apiClient.get(`/search/users?${params.toString()}`);
  },
};
