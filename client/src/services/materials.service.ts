import { apiClient } from './api-client';

export type MaterialType = 'pdf' | 'video' | 'document' | 'link';

export interface CreateMaterialPayload {
  title: string;
  type: MaterialType;
  file_url?: string;
}

export interface UpdateMaterialPayload {
  title?: string;
  type?: MaterialType;
  file_url?: string | null;
}

export const materialsService = {
  listByCourse(courseId: string) {
    return apiClient.get(`/courses/${courseId}/materials`);
  },

  create(courseId: string, payload: CreateMaterialPayload) {
    return apiClient.post(`/courses/${courseId}/materials`, payload);
  },

  getById(materialId: string) {
    return apiClient.get(`/materials/${materialId}`);
  },

  update(materialId: string, payload: UpdateMaterialPayload) {
    return apiClient.put(`/materials/${materialId}`, payload);
  },

  delete(materialId: string) {
    return apiClient.delete(`/materials/${materialId}`);
  },
};
