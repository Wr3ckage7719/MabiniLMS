import { apiClient } from './api-client';

export const twoFactorService = {
  setup() {
    return apiClient.post('/2fa/setup');
  },

  verify(code: string) {
    return apiClient.post('/2fa/verify', { code });
  },

  disable(code: string) {
    return apiClient.post('/2fa/disable', { code });
  },

  status() {
    return apiClient.get('/2fa/status');
  },

  regenerateBackupCodes() {
    return apiClient.post('/2fa/backup-codes');
  },
};
