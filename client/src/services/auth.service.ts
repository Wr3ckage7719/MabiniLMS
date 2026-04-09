import { apiClient } from './api-client';

export interface SignupData {
  email: string;
  password: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
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

export interface StudentSignupResponse {
  success: boolean;
  data?: {
    message: string;
  };
  error?: string;
}

export const authService = {
  async signup(data: SignupData): Promise<AuthResponse> {
    const fullName = (data.full_name || '').trim();
    const [firstToken, ...restTokens] = fullName.split(' ').filter(Boolean);

    const first_name = data.first_name || firstToken || 'User';
    const last_name = data.last_name || restTokens.join(' ') || 'Account';

    return apiClient.post('/auth/signup', {
      email: data.email,
      password: data.password,
      role: data.role,
      first_name,
      last_name,
    });
  },

  async requestStudentCredentials(email: string): Promise<StudentSignupResponse> {
    return apiClient.post('/auth/student-signup', { email });
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
    return apiClient.post('/auth/send-password-reset', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/reset-password-token', { token, password: newPassword });
  },

  async verifyEmail(token: string): Promise<{ success: boolean }> {
    const params = new URLSearchParams({ token });
    return apiClient.get(`/auth/verify-email?${params.toString()}`);
  },

  async resendVerification(email: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/resend-verification', { email });
  },
};
