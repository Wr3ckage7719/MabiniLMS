import { supabaseAdmin } from '../../src/lib/supabase.js';
import { UserRole } from '../../src/types/index.js';
import { CourseStatus } from '../../src/types/courses.js';
import * as coursesService from '../../src/services/courses.js';

type QueryBuilder = {
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
};

const createCoursesQueryBuilder = () => {
  const builder: QueryBuilder = {
    eq: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.order.mockResolvedValue({ data: [], error: null, count: 0 });

  return builder;
};

const createEnrollmentLookupBuilder = (
  data: Array<{ course_id: string }>
) => {
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.in.mockResolvedValue({ data, error: null });

  return builder;
};

const createCourseByIdBuilder = (course: Record<string, unknown>) => {
  const builder = {
    eq: vi.fn(),
    single: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.single.mockResolvedValue({ data: course, error: null });

  return builder;
};

const createEnrollmentAccessBuilder = (data: Array<{ id: string }>) => {
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.limit.mockResolvedValue({ data, error: null });

  return builder;
};

describe('coursesService.listCourses role filtering', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('restricts teachers to their own courses only', async () => {
    const teacherId = '11111111-1111-1111-1111-111111111111';
    const coursesBuilder = createCoursesQueryBuilder();

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnValue(coursesBuilder),
        } as any;
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    await coursesService.listCourses(
      { page: 1, limit: 10 } as any,
      teacherId,
      UserRole.TEACHER
    );

    expect(coursesBuilder.eq).toHaveBeenCalledWith('teacher_id', teacherId);
    expect(coursesBuilder.or).not.toHaveBeenCalled();
  });

  it('allows teacher status filtering within owned courses', async () => {
    const teacherId = '22222222-2222-2222-2222-222222222222';
    const coursesBuilder = createCoursesQueryBuilder();

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnValue(coursesBuilder),
        } as any;
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    await coursesService.listCourses(
      { page: 1, limit: 10, status: CourseStatus.ARCHIVED } as any,
      teacherId,
      UserRole.TEACHER
    );

    expect(coursesBuilder.eq).toHaveBeenCalledWith('teacher_id', teacherId);
    expect(coursesBuilder.eq).toHaveBeenCalledWith('status', CourseStatus.ARCHIVED);
  });

  it('keeps admin teacher filter behavior intact', async () => {
    const teacherId = '33333333-3333-3333-3333-333333333333';
    const coursesBuilder = createCoursesQueryBuilder();

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnValue(coursesBuilder),
        } as any;
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    await coursesService.listCourses(
      { page: 1, limit: 10, teacher_id: teacherId } as any,
      'admin-user-id',
      UserRole.ADMIN
    );

    expect(coursesBuilder.eq).toHaveBeenCalledWith('teacher_id', teacherId);
  });

  it('restricts students to enrolled courses only', async () => {
    const studentId = '44444444-4444-4444-4444-444444444444';
    const coursesBuilder = createCoursesQueryBuilder();
    const enrollmentBuilder = createEnrollmentLookupBuilder([
      { course_id: 'course-a' },
      { course_id: 'course-b' },
    ]);

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnValue(coursesBuilder),
        } as any;
      }

      if (table === 'enrollments') {
        return {
          select: vi.fn().mockReturnValue(enrollmentBuilder),
        } as any;
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    await coursesService.listCourses(
      { page: 1, limit: 10 } as any,
      studentId,
      UserRole.STUDENT
    );

    expect(enrollmentBuilder.eq).toHaveBeenCalledWith('student_id', studentId);
    expect(enrollmentBuilder.in).toHaveBeenCalledWith('status', expect.arrayContaining(['active', 'enrolled']));
    expect(coursesBuilder.in).toHaveBeenCalledWith('id', ['course-a', 'course-b']);
    expect(coursesBuilder.eq).not.toHaveBeenCalledWith('status', CourseStatus.PUBLISHED);
  });

  it('returns empty courses for students with no enrollments', async () => {
    const studentId = '55555555-5555-5555-5555-555555555555';
    const coursesBuilder = createCoursesQueryBuilder();
    const enrollmentBuilder = createEnrollmentLookupBuilder([]);

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnValue(coursesBuilder),
        } as any;
      }

      if (table === 'enrollments') {
        return {
          select: vi.fn().mockReturnValue(enrollmentBuilder),
        } as any;
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    const result = await coursesService.listCourses(
      { page: 1, limit: 10 } as any,
      studentId,
      UserRole.STUDENT
    );

    expect(result).toEqual({
      courses: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
    expect(coursesBuilder.range).not.toHaveBeenCalled();
  });
});

describe('coursesService.getCourseById access control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks students from reading courses they are not enrolled in', async () => {
    const courseId = '66666666-6666-6666-6666-666666666666';
    const studentId = '77777777-7777-7777-7777-777777777777';
    const courseBuilder = createCourseByIdBuilder({
      id: courseId,
      teacher_id: '88888888-8888-8888-8888-888888888888',
      title: 'Biology',
      description: null,
      syllabus: null,
      status: CourseStatus.PUBLISHED,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    const enrollmentAccessBuilder = createEnrollmentAccessBuilder([]);

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnValue(courseBuilder),
        } as any;
      }

      if (table === 'enrollments') {
        return {
          select: vi.fn().mockReturnValue(enrollmentAccessBuilder),
        } as any;
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    await expect(
      coursesService.getCourseById(courseId, false, studentId, UserRole.STUDENT)
    ).rejects.toThrow('Students can only access classes they are enrolled in');
  });
});