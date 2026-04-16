import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { supabase } from '@/lib/supabase';

const resolveApiUrl = () => {
  const configuredApiUrl = import.meta.env.VITE_API_URL;
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.origin}/api`;
  }

  return 'http://localhost:3000/api';
};

const API_URL = resolveApiUrl();
const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';
const AUTH_LOOKUP_TIMEOUT_MS = 4000;

const toErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | { error?: { message?: string }; message?: string }
      | undefined;
    return String(
      responseData?.error?.message || responseData?.message || error.message || ''
    ).toLowerCase();
  }

  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return String(error || '').toLowerCase();
};

const isRefreshRejectedByAuth = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 400 || status === 401 || status === 403) {
      return true;
    }
  }

  const message = toErrorMessage(error);
  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token has expired') ||
    message.includes('refresh token revoked') ||
    message.includes('jwt expired')
  );
};

const shouldForceSignOutAfterRefreshFailure = (error: unknown): boolean => {
  if (!error) {
    return false;
  }

  if (isRefreshRejectedByAuth(error)) {
    return true;
  }

  const message = toErrorMessage(error);
  return message.includes('missing refresh token');
};

const readSupabaseAccessTokenFromStorage = (storageRef: Storage | null): string | null => {
  if (!storageRef) {
    return null;
  }

  const authStorageKeys = Object.keys(storageRef).filter(
    (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
  );

  for (const key of authStorageKeys) {
    const rawValue = storageRef.getItem(key);
    if (!rawValue) {
      continue;
    }

    const parsedValue = JSON.parse(rawValue) as
      | { access_token?: string; currentSession?: { access_token?: string } }
      | Array<{ access_token?: string }>;

    if (
      typeof (parsedValue as { access_token?: string }).access_token === 'string' &&
      (parsedValue as { access_token?: string }).access_token
    ) {
      return (parsedValue as { access_token?: string }).access_token || null;
    }

    const currentSessionToken =
      (parsedValue as { currentSession?: { access_token?: string } }).currentSession
        ?.access_token;
    if (typeof currentSessionToken === 'string' && currentSessionToken) {
      return currentSessionToken;
    }

    if (Array.isArray(parsedValue)) {
      const arrayToken = parsedValue.find((item) => typeof item?.access_token === 'string')
        ?.access_token;
      if (arrayToken) {
        return arrayToken;
      }
    }
  }

  return null;
};

const readPersistedAccessToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const localToken = readSupabaseAccessTokenFromStorage(window.localStorage);
    if (localToken) {
      return localToken;
    }

    const sessionToken = readSupabaseAccessTokenFromStorage(window.sessionStorage);
    if (sessionToken) {
      return sessionToken;
    }
  } catch {
    // Fallback token lookup is best effort only.
  }

  return null;
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
};

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        try {
          const {
            data: { session },
          } = await withTimeout(
            supabase.auth.getSession(),
            AUTH_LOOKUP_TIMEOUT_MS,
            'Auth session lookup timed out'
          );

          if (session?.access_token) {
            config.headers.Authorization = `Bearer ${session.access_token}`;
          }
        } catch (sessionError) {
          // On mobile resume, getSession can briefly timeout while storage wakes up.
          const fallbackAccessToken = readPersistedAccessToken();
          if (fallbackAccessToken) {
            config.headers.Authorization = `Bearer ${fallbackAccessToken}`;
          } else {
            console.warn('Proceeding without auth header due to session lookup failure', sessionError);
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          const originalRequest = error.config as RetryableRequestConfig | undefined;
          const hasRetried = Boolean(originalRequest?._retry);
          let refreshError: unknown = null;
          let refreshAttempted = false;

          if (!hasRetried && originalRequest) {
            refreshAttempted = true;
            originalRequest._retry = true;

            // Token may be stale, try to refresh once via backend endpoint.
            let refreshedSession: { access_token?: string; refresh_token?: string } | null = null;

            try {
              const {
                data: { session: currentSession },
              } = await withTimeout(
                supabase.auth.getSession(),
                AUTH_LOOKUP_TIMEOUT_MS,
                'Auth session lookup timed out'
              );

              const refreshToken = currentSession?.refresh_token;

              if (!refreshToken) {
                throw new Error('Missing refresh token');
              }

              const refreshResponse = await withTimeout(
                axios.post<{
                  success: boolean;
                  data?: {
                    access_token: string;
                    refresh_token: string;
                  };
                }>(
                  `${API_URL}/auth/refresh`,
                  { refresh_token: refreshToken },
                  {
                    timeout: AUTH_LOOKUP_TIMEOUT_MS,
                    withCredentials: true,
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  }
                ),
                AUTH_LOOKUP_TIMEOUT_MS,
                'Auth session refresh timed out'
              );

              if (!refreshResponse.data?.success || !refreshResponse.data.data) {
                throw new Error('Session refresh failed');
              }

              refreshedSession = refreshResponse.data.data;

              const { error: setSessionError } = await supabase.auth.setSession({
                access_token: refreshedSession.access_token || '',
                refresh_token: refreshedSession.refresh_token || '',
              });

              if (setSessionError) {
                throw setSessionError;
              }
            } catch (refreshFailure) {
              refreshError = refreshFailure;
            }

            if (!refreshError && refreshedSession?.access_token) {
              originalRequest.headers.Authorization = `Bearer ${refreshedSession.access_token}`;
              return this.client.request(originalRequest);
            }
          }

          // Only force sign-out when auth is truly invalid, not on transient resume/network failures.
          const shouldForceSignOut =
            !refreshAttempted || shouldForceSignOutAfterRefreshFailure(refreshError);

          if (shouldForceSignOut) {
            await supabase.auth.signOut();
            window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
          }

          return Promise.reject(error);
        }

        if (error.code === 'ECONNABORTED') {
          return Promise.reject(new Error('Request timed out. Please check your network and try again.'));
        }

        if (!error.response) {
          return Promise.reject(new Error('Network error. Unable to reach the server.'));
        }

        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config = {}) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config = {}) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config = {}) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config = {}) {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config = {}) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
