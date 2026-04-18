import { QueryClient } from '@tanstack/react-query';

interface InvalidateClassDataOptions {
  classId?: string;
}

/**
 * Invalidate class-related queries so all role views stay in sync after class mutations.
 */
export const invalidateClassData = async (
  queryClient: QueryClient,
  options: InvalidateClassDataOptions = {}
): Promise<void> => {
  const { classId } = options;
  const invalidations: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: ['classes'] }),
  ];

  if (classId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['class', classId] }),
      queryClient.invalidateQueries({ queryKey: ['students', classId] }),
      queryClient.invalidateQueries({ queryKey: ['assignments', classId] }),
      queryClient.invalidateQueries({ queryKey: ['announcements', classId] }),
      queryClient.invalidateQueries({ queryKey: ['materials', classId] }),
      queryClient.invalidateQueries({ queryKey: ['discussion-posts', classId] }),
      queryClient.invalidateQueries({ queryKey: ['my-grades', classId] }),
      queryClient.invalidateQueries({ queryKey: ['course-grades', classId] }),
      queryClient.invalidateQueries({ queryKey: ['weighted-course-grade', classId] })
    );
  }

  await Promise.all(invalidations);
};
