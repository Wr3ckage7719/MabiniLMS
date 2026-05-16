import { supabaseAdmin } from '../../src/lib/supabase.js'
import * as engagementService from '../../src/services/teacher-engagement.js'

const COURSE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const STUDENT_A = '11111111-1111-1111-1111-111111111111'
const STUDENT_B = '22222222-2222-2222-2222-222222222222'
const MATERIAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MATERIAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

interface MockSnapshot {
  materials: Array<{ id: string; title: string; type: string | null }>
  enrolments: Array<{ student_id: string }>
  progress: Array<{
    material_id: string
    user_id: string
    progress_percent: number
    completed: boolean
    download_count: number
    last_viewed_at: string | null
  }>
}

const installMaterialEngagementMock = (snap: MockSnapshot): void => {
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
    if (table === 'course_materials') {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: snap.materials, error: null }),
          }),
        }),
      } as any
    }
    if (table === 'enrollments') {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: snap.enrolments, error: null }),
          }),
        }),
      } as any
    }
    if (table === 'material_progress') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: snap.progress, error: null }),
        }),
      } as any
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('teacher-engagement: getCourseMaterialEngagementSummary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns one row per material with computed rollups', async () => {
    installMaterialEngagementMock({
      materials: [
        { id: MATERIAL_A, title: 'Chapter 1', type: 'pdf' },
        { id: MATERIAL_B, title: 'Chapter 2', type: 'video' },
      ],
      enrolments: [{ student_id: STUDENT_A }, { student_id: STUDENT_B }],
      progress: [
        {
          material_id: MATERIAL_A,
          user_id: STUDENT_A,
          progress_percent: 100,
          completed: true,
          download_count: 1,
          last_viewed_at: '2026-04-30T12:00:00.000Z',
        },
        {
          material_id: MATERIAL_A,
          user_id: STUDENT_B,
          progress_percent: 40,
          completed: false,
          download_count: 0,
          last_viewed_at: '2026-04-29T08:00:00.000Z',
        },
        {
          material_id: MATERIAL_B,
          user_id: STUDENT_A,
          progress_percent: 0,
          completed: false,
          download_count: 2,
          last_viewed_at: null,
        },
      ],
    })

    const summary = await engagementService.getCourseMaterialEngagementSummary(COURSE_ID)

    expect(summary.course_id).toBe(COURSE_ID)
    expect(summary.materials).toHaveLength(2)

    const a = summary.materials.find((m) => m.material_id === MATERIAL_A)!
    expect(a.enrolled_students).toBe(2)
    expect(a.students_started).toBe(2)
    expect(a.students_completed).toBe(1)
    expect(a.total_downloads).toBe(1)
    expect(a.avg_progress_percent).toBe(70)
    expect(a.last_activity_at).toBe('2026-04-30T12:00:00.000Z')

    const b = summary.materials.find((m) => m.material_id === MATERIAL_B)!
    expect(b.students_started).toBe(0)
    expect(b.students_completed).toBe(0)
    expect(b.total_downloads).toBe(2)
    expect(b.avg_progress_percent).toBe(0)
  })

  it('ignores progress rows from non-enrolled users', async () => {
    installMaterialEngagementMock({
      materials: [{ id: MATERIAL_A, title: 'Chapter 1', type: 'pdf' }],
      enrolments: [{ student_id: STUDENT_A }],
      progress: [
        {
          material_id: MATERIAL_A,
          user_id: STUDENT_A,
          progress_percent: 50,
          completed: false,
          download_count: 0,
          last_viewed_at: null,
        },
        {
          material_id: MATERIAL_A,
          user_id: STUDENT_B, // not enrolled
          progress_percent: 100,
          completed: true,
          download_count: 5,
          last_viewed_at: null,
        },
      ],
    })

    const summary = await engagementService.getCourseMaterialEngagementSummary(COURSE_ID)
    const a = summary.materials[0]
    expect(a.enrolled_students).toBe(1)
    expect(a.students_started).toBe(1)
    expect(a.students_completed).toBe(0)
    expect(a.total_downloads).toBe(0)
  })

  it('returns an empty material list with no error when the course has none', async () => {
    installMaterialEngagementMock({
      materials: [],
      enrolments: [{ student_id: STUDENT_A }],
      progress: [],
    })

    const summary = await engagementService.getCourseMaterialEngagementSummary(COURSE_ID)
    expect(summary.materials).toEqual([])
  })
})

interface MaterialDetailSnapshot {
  material: { id: string; title: string; type: string | null; course_id: string } | null
  materialError: { code?: string; message?: string } | null
  enrolments: Array<{
    student: {
      id: string
      email: string
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
    }
  }>
  progress: Array<{
    user_id: string
    progress_percent: number | null
    completed: boolean
    download_count: number | null
    last_viewed_at: string | null
    completed_at: string | null
  }>
}

const installMaterialDetailMock = (snap: MaterialDetailSnapshot): void => {
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
    if (table === 'course_materials') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: snap.material,
                  error: snap.materialError ?? null,
                }),
            }),
          }),
        }),
      } as any
    }
    if (table === 'enrollments') {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: snap.enrolments, error: null }),
          }),
        }),
      } as any
    }
    if (table === 'material_progress') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: snap.progress, error: null }),
          }),
        }),
      } as any
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('teacher-engagement: getMaterialStudentEngagement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns one row per enrolled student with their progress', async () => {
    installMaterialDetailMock({
      material: { id: MATERIAL_A, title: 'Chapter 1', type: 'pdf', course_id: COURSE_ID },
      materialError: null,
      enrolments: [
        {
          student: {
            id: STUDENT_A,
            email: 'a@example.com',
            first_name: 'Ana',
            last_name: 'Alpha',
            avatar_url: null,
          },
        },
        {
          student: {
            id: STUDENT_B,
            email: 'b@example.com',
            first_name: 'Ben',
            last_name: 'Bravo',
            avatar_url: null,
          },
        },
      ],
      progress: [
        {
          user_id: STUDENT_A,
          progress_percent: 100,
          completed: true,
          download_count: 2,
          last_viewed_at: '2026-04-30T12:00:00.000Z',
          completed_at: '2026-04-30T12:30:00.000Z',
        },
      ],
    })

    const detail = await engagementService.getMaterialStudentEngagement(COURSE_ID, MATERIAL_A)
    expect(detail.material_id).toBe(MATERIAL_A)
    expect(detail.material_title).toBe('Chapter 1')
    expect(detail.students).toHaveLength(2)

    const a = detail.students.find((s) => s.student_id === STUDENT_A)!
    expect(a.started).toBe(true)
    expect(a.completed).toBe(true)
    expect(a.progress_percent).toBe(100)
    expect(a.download_count).toBe(2)

    const b = detail.students.find((s) => s.student_id === STUDENT_B)!
    expect(b.started).toBe(false)
    expect(b.completed).toBe(false)
    expect(b.progress_percent).toBe(0)
    expect(b.download_count).toBe(0)
    expect(b.last_viewed_at).toBeNull()

    expect(detail.students_started).toBe(1)
    expect(detail.students_completed).toBe(1)
    expect(detail.total_downloads).toBe(2)
    expect(detail.avg_progress_percent).toBe(50)
    expect(detail.last_activity_at).toBe('2026-04-30T12:00:00.000Z')
  })

  it('throws NOT_FOUND when the material does not exist', async () => {
    installMaterialDetailMock({
      material: null,
      materialError: { code: 'PGRST116', message: 'no rows' },
      enrolments: [],
      progress: [],
    })

    await expect(
      engagementService.getMaterialStudentEngagement(COURSE_ID, MATERIAL_A)
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
