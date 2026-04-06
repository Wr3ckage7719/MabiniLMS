import { apiClient } from './api-client';

export interface SignupData {
  email: string;
  password: string;
  full_name: string;
  role?: 'student' | 'teacher';
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    user: any;
    session: any;
  };
  error?: string;
}

export const authService = {
  async signup(data: SignupData): Promise<AuthResponse> {
    return apiClient.post('/auth/signup', data);
  },

  async login(data: LoginData): Promise<AuthResponse> {
    return apiClient.post('/auth/login', data);
  },

  async logout(): Promise<void> {
    return apiClient.post('/auth/logout');
  },

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    return apiClient.post('/auth/refresh', { refresh_token: refreshToken });
  },

  async forgotPassword(email: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/reset-password', { token, new_password: newPassword });
  },

  async verifyEmail(token: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/verify-email', { token });
  },

  async resendVerification(email: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/resend-verification', { email });
  },
};
