import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { coursesService } from '@/services/courses.service';
import { transformCourses } from '@/services/data-transformer';
import { ClassItem } from '@/lib/data';

export function useClasses(params?: { archived?: boolean; role?: 'student' | 'teacher' }): UseQueryResult<ClassItem[], Error> {
  return useQuery({
    queryKey: ['classes', params],
    queryFn: async () => {
      const response = await coursesService.getCourses(params);
      return transformCourses(response.data?.courses || []);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useClass(classId: string): UseQueryResult<ClassItem, Error> {
  return useQuery({
    queryKey: ['class', classId],
    queryFn: async () => {
      const response = await coursesService.getCourseById(classId);
      return transformCourses([response.data?.course])[0];
    },
    enabled: !!classId,
  });
}
