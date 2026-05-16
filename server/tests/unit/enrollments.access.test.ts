import { supabaseAdmin } from '../../src/lib/supabase.js';
import { UserRole, ApiError } from '../../src/types/index.js';
import * as enrollmentsService from '../../src/services/enrollments.js';

type SingleBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

const createEnrollmentLookupBuilder = (
  result: { data: Record<string, unknown> | null; error: { message: string } | null }
): SingleBuilder => {
  const builder: SingleBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.single.mockResolvedValue(result);
  return builder;
};

const STUDENT_A = '11111111-1111-1111-1111-111111111111';
const STUDENT_B = '22222222-2222-2222-2222-222222222222';
const TEACHER_OWNER = '33333333-3333-3333-3333-333333333333';
const TEACHER_OTHER = '44444444-4444-4444-4444-444444444444';
const ADMIN_USER = '55555555-5555-5555-5555-555555555555';

const enrollmentRow = {
  id: 'enrollment-1',
  course_id: 'course-1',
  student_id: STUDENT_A,
  enrolled_at: '2026-05-01T00:00:00Z',
  status: 'active',
  course: {
    id: 'course-1',
    title: 'Math',
    description: 'desc',
    status: 'active',
    teacher: {
      id: TEACHER_OWNER,
      email: 'teacher@mabinicolleges.edu.ph',
      first_name: 'Ana',
      last_name: 'Reyes',
    },
  },
};

describe('enrollmentsService.assertEnrollmentAccess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockLookup = () => {
    vi.spyOn(supabaseAdmin, 'from').mockReturnValue(
      createEnrollmentLookupBuilder({ data: enrollmentRow, error: null }) as any
    );
  };

  it('allows the enrolled student', async () => {
    mockLookup();
    const result = await enrollmentsService.assertEnrollmentAccess(
      'enrollment-1',
      STUDENT_A,
      UserRole.STUDENT
    );
    expect(result.id).toBe('enrollment-1');
  });

  it('rejects a different student with 403', async () => {
    mockLookup();
    await expect(
      enrollmentsService.assertEnrollmentAccess('enrollment-1', STUDENT_B, UserRole.STUDENT)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows the course teacher', async () => {
    mockLookup();
    const result = await enrollmentsService.assertEnrollmentAccess(
      'enrollment-1',
      TEACHER_OWNER,
      UserRole.TEACHER
    );
    expect(result.id).toBe('enrollment-1');
  });

  it('rejects a different teacher with 403', async () => {
    mockLookup();
    await expect(
      enrollmentsService.assertEnrollmentAccess('enrollment-1', TEACHER_OTHER, UserRole.TEACHER)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows any admin', async () => {
    mockLookup();
    const result = await enrollmentsService.assertEnrollmentAccess(
      'enrollment-1',
      ADMIN_USER,
      UserRole.ADMIN
    );
    expect(result.id).toBe('enrollment-1');
  });

  it('returns 404 when the row is missing', async () => {
    vi.spyOn(supabaseAdmin, 'from').mockReturnValue(
      createEnrollmentLookupBuilder({ data: null, error: { message: 'not found' } }) as any
    );
    await expect(
      enrollmentsService.assertEnrollmentAccess('missing', STUDENT_A, UserRole.STUDENT)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
