import { apiClient } from './api-client';

export type MaterialType = 'pdf' | 'video' | 'document' | 'link';

export interface CreateMaterialPayload {
  title: string;
  type: MaterialType;
  file_url?: string;
  file?: File;
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

export interface MaterialProgressRecord {
  id: string;
  material_id: string;
  course_id: string;
  user_id: string;
  progress_percent: number;
  completed: boolean;
  last_viewed_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const materialsService = {
  listByCourse(courseId: string) {
    return apiClient.get(`/courses/${courseId}/materials`);
  },

  create(courseId: string, payload: CreateMaterialPayload) {
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

  listProgress(materialId: string) {
    return apiClient.get(`/materials/${materialId}/progress`);
  },

  delete(materialId: string) {
    return apiClient.delete(`/materials/${materialId}`);
  },
};
