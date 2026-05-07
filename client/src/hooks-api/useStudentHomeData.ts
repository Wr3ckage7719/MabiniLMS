import { useClasses } from './useClasses';
import { useAssignments } from './useAssignments';
import { useStudentProgressSummary } from './useLessons';

export function useStudentHomeData() {
  const classesQuery = useClasses();
  const assignmentsQuery = useAssignments();
  const progressQuery = useStudentProgressSummary();

  return {
    classes: classesQuery.data ?? [],
    assignments: assignmentsQuery.data ?? [],
    progressSummary: progressQuery.data ?? [],
    isLoading: classesQuery.isLoading,
    error: classesQuery.error,
    refetch: classesQuery.refetch,
  };
}
