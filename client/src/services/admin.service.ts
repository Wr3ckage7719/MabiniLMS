import { apiClient } from './api-client';

/**
 * Admin API Service
 * Handles all admin-related API calls
 */

export interface PendingTeacher {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  pending_approval: boolean;
}

export interface StudentData {
  email: string;
  first_name: string;
  last_name: string;
  student_id?: string;
}

export interface CreateStudentResponse {
  student: any;
  temporary_password: string;
}

export interface BulkCreateResult {
  total: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_user_id: string | null;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  admin?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  target_user?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface SystemSettings {
  [key: string]: {
    value: any;
    description: string;
    updated_at: string;
  };
}

export interface DashboardStats {
  pending_teachers: number;
  total_students: number;
  total_teachers: number;
  active_courses: number;
}

export interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: 'admin' | 'teacher' | 'student';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const unwrapApiData = <T>(response: any): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data as T;
  }
  return response as T;
};

// Teacher Management
export const listPendingTeachers = async (): Promise<PendingTeacher[]> => {
  const response = await apiClient.get('/admin/teachers/pending');
  return unwrapApiData<PendingTeacher[]>(response);
};

export const approveTeacher = async (teacherId: string): Promise<void> => {
  await apiClient.post(`/admin/teachers/${teacherId}/approve`);
};

export const rejectTeacher = async (teacherId: string, reason?: string): Promise<void> => {
  await apiClient.post(`/admin/teachers/${teacherId}/reject`, { reason });
};

// Student Management
export const createStudent = async (studentData: StudentData): Promise<CreateStudentResponse> => {
  const response = await apiClient.post('/admin/students', studentData);
  return unwrapApiData<CreateStudentResponse>(response);
};

export const bulkCreateStudents = async (students: StudentData[]): Promise<BulkCreateResult> => {
  const response = await apiClient.post('/admin/students/bulk', { students });
  return unwrapApiData<BulkCreateResult>(response);
};

export const listUsers = async (params?: {
  page?: number;
  limit?: number;
  role?: 'admin' | 'teacher' | 'student';
  search?: string;
}): Promise<PaginatedUsersResponse> => {
  const response = await apiClient.get('/users', { params });
  return unwrapApiData<PaginatedUsersResponse>(response);
};

// System Settings
export const getSystemSettings = async (): Promise<SystemSettings> => {
  const response = await apiClient.get('/admin/settings');
  return unwrapApiData<SystemSettings>(response);
};

export const updateSystemSettings = async (settings: Record<string, any>): Promise<void> => {
  await apiClient.put('/admin/settings', settings);
};

// Audit Logs
export const getAuditLogs = async (params?: {
  admin_id?: string;
  action_type?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogsResponse> => {
  const response = await apiClient.get('/admin/audit-logs', { params });
  return unwrapApiData<AuditLogsResponse>(response);
};

// Dashboard Stats
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await apiClient.get('/admin/stats');
  return unwrapApiData<DashboardStats>(response);
};
