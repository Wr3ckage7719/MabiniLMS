import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import type { Lesson, LessonChain } from '@/lib/data';
import {
  lessonsService,
  LessonEditorPayload,
  type LessonEngagementMatrix,
} from '@/services/lessons.service';

// Frontend-only hooks backed by `lessons.service.ts` (which currently reads
// from in-memory fixtures). Once the backend lands these query keys and
// signatures stay; only the service implementation flips.

const studentLessonsKey = (classId: string | undefined) => ['lessons', 'student', classId];
const studentLessonKey = (classId: string | undefined, lessonId: string | undefined) =>
  ['lessons', 'student', classId, lessonId];
const teacherLessonsKey = (classId: string | undefined) => ['lessons', 'teacher', classId];
const teacherLessonKey = (classId: string | undefined, lessonId: string | undefined) =>
  ['lessons', 'teacher', classId, lessonId];

export function useStudentLessons(
  classId?: string
): UseQueryResult<Lesson[], Error> {
  return useQuery({
    queryKey: studentLessonsKey(classId),
    queryFn: () => lessonsService.listForStudent(classId ?? ''),
    enabled: Boolean(classId),
    staleTime: 30 * 1000,
  });
}

export function useStudentLesson(
  classId?: string,
  lessonId?: string
): UseQueryResult<Lesson | null, Error> {
  return useQuery({
    queryKey: studentLessonKey(classId, lessonId),
    queryFn: () => lessonsService.getForStudent(classId ?? '', lessonId ?? ''),
    enabled: Boolean(classId && lessonId),
    staleTime: 30 * 1000,
  });
}

export function useTeacherLessons(
  classId?: string
): UseQueryResult<Lesson[], Error> {
  return useQuery({
    queryKey: teacherLessonsKey(classId),
    queryFn: () => lessonsService.listForTeacher(classId ?? ''),
    enabled: Boolean(classId),
    staleTime: 30 * 1000,
  });
}

export function useTeacherLesson(
  classId?: string,
  lessonId?: string
): UseQueryResult<Lesson | null, Error> {
  return useQuery({
    queryKey: teacherLessonKey(classId, lessonId),
    queryFn: () => lessonsService.getForTeacher(classId ?? '', lessonId ?? ''),
    enabled: Boolean(classId && lessonId),
    staleTime: 30 * 1000,
  });
}

export function useMarkLessonAsDone(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => lessonsService.markAsDone(classId, lessonId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studentLessonsKey(classId) });
      void queryClient.invalidateQueries({ queryKey: ['lessons', 'student', classId] });
    },
  });
}

export function useCreateLessonDraft(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => lessonsService.createDraft(classId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teacherLessonsKey(classId) });
    },
  });
}

export function useUpdateLesson(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      lessonId,
      payload,
    }: {
      lessonId: string;
      payload: LessonEditorPayload;
    }) => lessonsService.update(classId, lessonId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teacherLessonsKey(classId) });
      void queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher', classId] });
    },
  });
}

export function useReorderLessons(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => lessonsService.reorder(classId, orderedIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teacherLessonsKey(classId) });
    },
  });
}

export function useSetLessonChain(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, chain }: { lessonId: string; chain: LessonChain }) =>
      lessonsService.setChain(classId, lessonId, chain),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teacherLessonsKey(classId) });
    },
  });
}

export function useDeleteLesson(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => lessonsService.deleteLesson(classId, lessonId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teacherLessonsKey(classId) });
    },
  });
}

const lessonEngagementKey = (classId: string | undefined) => ['lessons', 'engagement', classId];

export function useTrackLessonView() {
  // Fire-and-forget: the engagement matrix is read by teachers, so we don't
  // need to invalidate any student-side query. Errors are logged but not
  // surfaced — failing to track a view shouldn't block the lesson UI.
  return useMutation({
    mutationFn: ({ classId, lessonId }: { classId: string; lessonId: string }) =>
      lessonsService.trackView(classId, lessonId),
  });
}

export function useLessonEngagement(
  classId?: string
): UseQueryResult<LessonEngagementMatrix | null, Error> {
  return useQuery({
    queryKey: lessonEngagementKey(classId),
    queryFn: () => lessonsService.getEngagement(classId ?? ''),
    enabled: Boolean(classId),
    staleTime: 30 * 1000,
  });
}
