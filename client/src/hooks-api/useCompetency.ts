import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  competencyService,
  StudentCourseCompetencySummary,
  UnitWithEvidence,
} from '@/services/competency.service';

export function useCourseCompetencyUnits(
  courseId?: string
): UseQueryResult<UnitWithEvidence[], Error> {
  return useQuery({
    queryKey: ['competency-units', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return competencyService.listUnits(courseId);
    },
    enabled: Boolean(courseId),
    staleTime: 60 * 1000,
  });
}

export function useMyCompetencySummary(
  courseId?: string
): UseQueryResult<StudentCourseCompetencySummary | null, Error> {
  return useQuery({
    queryKey: ['competency-my-summary', courseId],
    queryFn: async () => {
      if (!courseId) return null;
      return competencyService.getMySummary(courseId);
    },
    enabled: Boolean(courseId),
    staleTime: 30 * 1000,
  });
}

export function useStudentCompetencySummary(
  courseId?: string,
  studentId?: string
): UseQueryResult<StudentCourseCompetencySummary | null, Error> {
  return useQuery({
    queryKey: ['competency-student-summary', courseId, studentId],
    queryFn: async () => {
      if (!courseId || !studentId) return null;
      return competencyService.getStudentSummary(courseId, studentId);
    },
    enabled: Boolean(courseId && studentId),
    staleTime: 30 * 1000,
  });
}
