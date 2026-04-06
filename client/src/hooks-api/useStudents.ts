import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { coursesService } from '@/services/courses.service';
import { transformUsers } from '@/services/data-transformer';
import { Student } from '@/lib/data';

export function useStudents(courseId: string): UseQueryResult<Student[], Error> {
  return useQuery({
    queryKey: ['students', courseId],
    queryFn: async () => {
      const response = await coursesService.getCourseStudents(courseId);
      return transformUsers(response.data?.students || []);
    },
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000,
  });
}
