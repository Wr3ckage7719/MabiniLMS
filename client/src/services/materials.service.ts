import { apiClient } from './api-client';
import type { AxiosProgressEvent } from 'axios';

export type MaterialType = 'pdf' | 'video' | 'document' | 'link';

export interface CreateMaterialPayload {
  title: string;
  type: MaterialType;
  file_url?: string;
  file?: File;
}

export interface CreateMaterialRequestOptions {
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
}

export interface UpdateMaterialPayload {
  title?: string;
  type?: MaterialType;
  file_url?: string | null;
}

export interface MaterialProgressPayload {
  progress_percent?: number;
  completed?: boolean;
  last_viewed_at?: string;
}

export interface MaterialTrackViewStartPayload {
  user_agent?: string;
  device_type?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export interface MaterialTrackViewEndPayload {
  time_spent_seconds: number;
  final_scroll_percent: number;
  completed?: boolean;
  page_number?: number;
}

export interface MaterialTrackDownloadPayload {
  file_name?: string;
  file_size?: number;
}

export interface MaterialTrackProgressPayload {
  scroll_percent: number;
  page_number?: number;
  pages_viewed?: number[];
  active_seconds?: number;
}

export interface MaterialEngagementEvent {
  type: 'view_start' | 'view_end' | 'download' | 'scroll';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface MaterialEngagementRecord {
  id: string;
  material_id: string;
  course_id: string;
  user_id: string;
  progress_percent: number;
  completed: boolean;
  download_count: number;
  current_scroll_position: number;
  pages_viewed: number[];
  interaction_events: MaterialEngagementEvent[];
  event_count: number;
  view_count: number;
  avg_session_duration_seconds: number | null;
  total_scan_seconds: number;
  last_viewed_at: string;
  completed_at: string | null;
  student: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface MaterialProgressRecord {
  id: string;
  material_id: string;
  course_id: string;
  user_id: string;
  progress_percent: number;
  completed: boolean;
  download_count?: number;
  current_scroll_position?: number;
  pages_viewed?: number[];
  interaction_events?: MaterialEngagementEvent[];
  last_viewed_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const materialsService = {
  listByCourse(courseId: string) {
    return apiClient.get(`/courses/${courseId}/materials`);
  },

  create(courseId: string, payload: CreateMaterialPayload, options: CreateMaterialRequestOptions = {}) {
    if (payload.file) {
      const formData = new FormData();
      formData.append('title', payload.title);
      formData.append('type', payload.type);
      formData.append('file', payload.file);

      if (payload.file_url) {
        formData.append('file_url', payload.file_url);
      }

      return apiClient.post(`/courses/${courseId}/materials`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: options.onUploadProgress,
      });
    }

    if (options.onUploadProgress) {
      return apiClient.post(`/courses/${courseId}/materials`, payload, {
        onUploadProgress: options.onUploadProgress,
      });
    }

    return apiClient.post(`/courses/${courseId}/materials`, payload);
  },

  getById(materialId: string) {
    return apiClient.get(`/materials/${materialId}`);
  },

  update(materialId: string, payload: UpdateMaterialPayload) {
    return apiClient.put(`/materials/${materialId}`, payload);
  },

  getMyProgress(materialId: string) {
    return apiClient.get(`/materials/${materialId}/progress/me`);
  },

  updateMyProgress(materialId: string, payload: MaterialProgressPayload) {
    return apiClient.put(`/materials/${materialId}/progress/me`, payload);
  },

  trackViewStart(materialId: string, payload: MaterialTrackViewStartPayload = {}) {
    return apiClient.post(`/materials/${materialId}/track/view-start`, payload);
  },

  trackViewEnd(materialId: string, payload: MaterialTrackViewEndPayload) {
    return apiClient.post(`/materials/${materialId}/track/view-end`, payload);
  },

  trackDownload(materialId: string, payload: MaterialTrackDownloadPayload = {}) {
    return apiClient.post(`/materials/${materialId}/track/download`, payload);
  },

  trackProgress(materialId: string, payload: MaterialTrackProgressPayload) {
    return apiClient.post(`/materials/${materialId}/track/progress`, payload);
  },

  listProgress(materialId: string) {
    return apiClient.get(`/materials/${materialId}/progress`);
  },

  getEngagement(materialId: string) {
    return apiClient.get(`/materials/${materialId}/engagement`);
  },

  delete(materialId: string) {
    return apiClient.delete(`/materials/${materialId}`);
  },
};
