import { apiClient } from './api-client';

const STUDENT_SIGNUP_REQUEST_TIMEOUT_MS = 90_000;

export interface SignupData {
  email: string;
  password?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  role?: 'student' | 'teacher';
}

export interface LoginData {
  email: string;
  password: string;
  twoFactorCode?: string;
  twoFactorChallengeId?: string;
  portal?: 'app' | 'admin';
  rememberMe?: boolean;
}

export interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface AuthPayload {
  user: any;
  session: AuthSessionPayload;
  requires2FA?: boolean;
  twoFactorChallengeId?: string;
}

export interface AuthResponse {
  success: boolean;
  data?: AuthPayload;
  error?: string;
}

export interface SignupResponse {
  success: boolean;
  data?: {
    message: string;
  };
  error?: string;
}

export interface StudentSignupResponse {
  success: boolean;
  data?: {
    message: string;
    delivery?: 'verification_link' | 'credentials_email' | 'password_reset_link';
  };
  error?: string;
}

export const authService = {
  async signup(data: SignupData): Promise<SignupResponse> {
    const fullName = (data.full_name || '').trim();
    const [firstToken, ...restTokens] = fullName.split(' ').filter(Boolean);

    const first_name = data.first_name || firstToken || 'User';
    const last_name = data.last_name || restTokens.join(' ') || 'Account';

    return apiClient.post('/auth/signup', {
      email: data.email,
      role: data.role,
      first_name,
      last_name,
    });
  },

  async requestStudentCredentials(email: string): Promise<StudentSignupResponse> {
    return apiClient.post(
      '/auth/student-signup',
      { email },
      { timeout: STUDENT_SIGNUP_REQUEST_TIMEOUT_MS }
    );
  },

  async login(data: LoginData): Promise<AuthResponse> {
    return apiClient.post('/auth/login', {
      email: data.email,
      password: data.password,
      twoFactorCode: data.twoFactorCode,
      twoFactorChallengeId: data.twoFactorChallengeId,
      portal: data.portal,
      remember_me: data.rememberMe ?? true,
    });
  },

  async completeStudentSignup(token: string, password: string): Promise<{ success: boolean; data?: { message: string } }> {
    return apiClient.post('/auth/student-signup/complete', { token, password });
  },

  async completeTeacherOnboarding(token: string, password: string): Promise<{ success: boolean; data?: { message: string } }> {
    return apiClient.post('/auth/teacher-onboarding/complete', { token, password });
  },

  async verifyTeacherSignup(token: string): Promise<{ success: boolean; data?: { message: string } }> {
    const params = new URLSearchParams({ token });
    return apiClient.get(`/auth/signup/teacher/verify?${params.toString()}`);
  },

  async getCurrentUser() {
    return apiClient.get('/auth/me');
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
