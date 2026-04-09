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
          // Avoid hanging all API requests when auth state lookup gets stuck.
          console.warn('Proceeding without auth header due to session lookup failure', sessionError);
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

          if (!hasRetried && originalRequest) {
            originalRequest._retry = true;

            // Token may be stale, try to refresh once.
            let session: { access_token?: string } | null = null;
            let refreshError: unknown = null;

            try {
              const refreshResult = await withTimeout(
                supabase.auth.refreshSession(),
                AUTH_LOOKUP_TIMEOUT_MS,
                'Auth session refresh timed out'
              );
              session = refreshResult.data.session;
              refreshError = refreshResult.error;
            } catch (refreshFailure) {
              refreshError = refreshFailure;
            }

            if (!refreshError && session) {
              originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
              return this.client.request(originalRequest);
            }
          }

          // Backend rejected the request after retry/refresh; expire local session to avoid endless loading loops.
          await supabase.auth.signOut();
          window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));

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
