import { apiClient } from './api-client';

export const googleOAuthService = {
  getOAuthUrl() {
    return apiClient.get('/auth/google/url');
  },

  initiateOAuth() {
    return apiClient.get('/auth/google');
  },

  handleCallback(params: { code: string; state?: string }) {
    const query = new URLSearchParams();
    query.append('code', params.code);
    if (params.state) query.append('state', params.state);
    return apiClient.get(`/auth/google/callback?${query.toString()}`);
  },

  refresh() {
    return apiClient.post('/auth/google/refresh');
  },

  revoke() {
    return apiClient.post('/auth/google/revoke');
  },
};
