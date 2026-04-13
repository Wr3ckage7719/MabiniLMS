import { supabaseAdmin } from '../../src/lib/supabase.js';
import { UserRole } from '../../src/types/index.js';
import { CourseStatus } from '../../src/types/courses.js';
import * as coursesService from '../../src/services/courses.js';

type QueryBuilder = {
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
};

const createCoursesQueryBuilder = () => {
  const builder: QueryBuilder = {
    eq: vi.fn(),
    or: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.order.mockResolvedValue({ data: [], error: null, count: 0 });

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
});