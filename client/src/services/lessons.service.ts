import type { Lesson, LessonChain, LessonCompletionRule } from '@/lib/data';
import { apiClient } from './api-client';

export interface LessonEngagementStudent {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface LessonEngagementLesson {
  id: string;
  title: string;
  ordering: number;
  is_general: boolean;
  is_published: boolean;
}

export interface LessonEngagementCell {
  lesson_id: string;
  student_id: string;
  opened: boolean;
  done: boolean;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  marked_done_at: string | null;
}

export interface LessonEngagementMatrix {
  lessons: LessonEngagementLesson[];
  students: LessonEngagementStudent[];
  cells: LessonEngagementCell[];
}

// ============================================
// Lessons API client (LM-centric flow).
// ============================================
//
// Mirrors the backend at /api/lessons. The hook layer
// (`hooks-api/useLessons.ts`) calls these methods; nothing else in the app
// should hit the API directly.

export interface LessonEditorPayload {
  title: string;
  description: string | null;
  topics: string[];
  completionRule: LessonCompletionRule;
  chain: LessonChain;
  isPublished: boolean;
}

const unwrap = <T>(response: { data?: T } | null | undefined): T | null => {
  if (!response || response.data === undefined || response.data === null) {
    return null;
  }
  return response.data;
};

const unwrapList = <T>(response: { data?: T[] } | null | undefined): T[] => {
  return unwrap(response) ?? [];
};

export const lessonsService = {
  // -------- student-facing reads --------
  // The base endpoint auto-detects the caller's role: a student gets the
  // locked/done state, a teacher of the same course gets the teacher view.
  async listForStudent(classId: string): Promise<Lesson[]> {
    if (!classId) return [];
    const response = await apiClient.get(`/lessons/courses/${classId}`);
    return unwrapList<Lesson>(response);
  },

  async getForStudent(classId: string, lessonId: string): Promise<Lesson | null> {
    if (!classId || !lessonId) return null;
    const response = await apiClient.get(
      `/lessons/courses/${classId}/lessons/${lessonId}`
    );
    return unwrap<Lesson>(response);
  },

  async markAsDone(classId: string, lessonId: string): Promise<Lesson | null> {
    const response = await apiClient.post(
      `/lessons/courses/${classId}/lessons/${lessonId}/mark-done`,
      {}
    );
    return unwrap<Lesson>(response);
  },

  // -------- teacher-facing reads --------
  async listForTeacher(classId: string): Promise<Lesson[]> {
    if (!classId) return [];
    const response = await apiClient.get(`/lessons/courses/${classId}/teacher`);
    return unwrapList<Lesson>(response);
  },

  async getForTeacher(classId: string, lessonId: string): Promise<Lesson | null> {
    if (!classId || !lessonId) return null;
    const response = await apiClient.get(
      `/lessons/courses/${classId}/lessons/${lessonId}/teacher`
    );
    return unwrap<Lesson>(response);
  },

  // -------- teacher-facing writes --------
  async createDraft(classId: string): Promise<Lesson> {
    const response = await apiClient.post(`/lessons/courses/${classId}`, {});
    const lesson = unwrap<Lesson>(response);
    if (!lesson) {
      throw new Error('Server did not return the new lesson');
    }
    return lesson;
  },

  async update(
    classId: string,
    lessonId: string,
    payload: LessonEditorPayload
  ): Promise<Lesson | null> {
    const response = await apiClient.patch(
      `/lessons/courses/${classId}/lessons/${lessonId}`,
      payload
    );
    return unwrap<Lesson>(response);
  },

  async reorder(classId: string, orderedIds: string[]): Promise<Lesson[]> {
    const response = await apiClient.put(`/lessons/courses/${classId}/order`, {
      lesson_ids: orderedIds,
    });
    return unwrapList<Lesson>(response);
  },

  async setChain(
    classId: string,
    lessonId: string,
    chain: LessonChain
  ): Promise<Lesson | null> {
    const response = await apiClient.patch(
      `/lessons/courses/${classId}/lessons/${lessonId}/chain`,
      chain
    );
    return unwrap<Lesson>(response);
  },

  async deleteLesson(classId: string, lessonId: string): Promise<void> {
    await apiClient.delete(`/lessons/courses/${classId}/lessons/${lessonId}`);
  },

  // -------- engagement tracking --------
  // Idempotent: the server upserts (insert + bump view_count). Safe to call
  // every time the student lands on the lesson detail page.
  async trackView(classId: string, lessonId: string): Promise<void> {
    if (!classId || !lessonId) return;
    await apiClient.post(
      `/lessons/courses/${classId}/lessons/${lessonId}/track-view`,
      {}
    );
  },

  async getEngagement(classId: string): Promise<LessonEngagementMatrix | null> {
    if (!classId) return null;
    const response = await apiClient.get(`/lessons/courses/${classId}/engagement`);
    return unwrap<LessonEngagementMatrix>(response);
  },
};
