import { apiClient } from './api-client';

export interface RequiredMaterialMeta {
  id: string;
  type: string | null;
  title: string;
}

export interface RequiredMaterial {
  id: string;
  assignment_id: string;
  material_id: string;
  min_progress_percent: number;
  created_at: string;
  material: RequiredMaterialMeta;
}

export interface RequiredMaterialsResponse {
  gating_enabled: boolean;
  materials: RequiredMaterial[];
}

export interface MissingRequirement {
  required_id: string;
  material_id: string;
  material_title: string;
  min_progress_percent: number;
  current_progress_percent: number;
  completed: boolean;
}

export interface AssessmentLockState {
  gating_enabled: boolean;
  required_count: number;
  satisfied_count: number;
  locked: boolean;
  missing: MissingRequirement[];
}

export interface SetRequiredMaterialsPayload {
  enabled?: boolean;
  materials: Array<{
    material_id: string;
    min_progress_percent?: number;
  }>;
}

const unwrap = <T,>(response: unknown): T | null => {
  if (!response || typeof response !== 'object') return null;
  const data = (response as { data?: unknown }).data;
  return (data as T) ?? null;
};

export const assessmentGatingService = {
  async getRequiredMaterials(assignmentId: string): Promise<RequiredMaterialsResponse | null> {
    const response = await apiClient.get(`/assignments/${assignmentId}/required-materials`);
    return unwrap<RequiredMaterialsResponse>(response);
  },

  async setRequiredMaterials(
    assignmentId: string,
    payload: SetRequiredMaterialsPayload
  ): Promise<RequiredMaterialsResponse | null> {
    const response = await apiClient.put(
      `/assignments/${assignmentId}/required-materials`,
      payload
    );
    return unwrap<RequiredMaterialsResponse>(response);
  },

  async getMyLockState(assignmentId: string): Promise<AssessmentLockState | null> {
    const response = await apiClient.get(`/assignments/${assignmentId}/lock-state/me`);
    return unwrap<AssessmentLockState>(response);
  },
};
