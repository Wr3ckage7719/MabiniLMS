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

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
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
            const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

            if (!refreshError && session) {
              originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
              return this.client.request(originalRequest);
            }
          }

          // Only expire auth state if Supabase session is truly gone.
          const { data: { session: activeSession } } = await supabase.auth.getSession();
          if (!activeSession) {
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
