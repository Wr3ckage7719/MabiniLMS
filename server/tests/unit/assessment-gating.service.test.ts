import { supabaseAdmin } from '../../src/lib/supabase.js'
import * as gatingService from '../../src/services/assessment-gating.js'

const ASSIGNMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MATERIAL_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MATERIAL_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

interface MockOptions {
  gatingEnabled: boolean
  required: Array<{
    id: string
    material_id: string
    title: string
    min_progress_percent: number
  }>
  progress: Array<{
    material_id: string
    progress_percent: number
    completed: boolean
  }>
}

const installSupabaseMock = (opts: MockOptions): void => {
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
    if (table === 'assignments') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { lm_gating_enabled: opts.gatingEnabled },
                error: null,
              }),
          }),
        }),
      } as any
    }

    if (table === 'assessment_required_materials') {
      const data = opts.required.map((r) => ({
        id: r.id,
        assignment_id: ASSIGNMENT_ID,
        material_id: r.material_id,
        min_progress_percent: r.min_progress_percent,
        created_at: '2026-05-01T00:00:00.000Z',
        material: {
          id: r.material_id,
          title: r.title,
          type: 'pdf',
        },
      }))
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data, error: null }),
          }),
        }),
      } as any
    }

    if (table === 'material_progress') {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: opts.progress, error: null }),
          }),
        }),
      } as any
    }

    throw new Error(`Unexpected table mock: ${table}`)
  })
}

describe('assessment-gating service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reports unlocked when no required materials are configured', async () => {
    installSupabaseMock({
      gatingEnabled: true,
      required: [],
      progress: [],
    })

    const state = await gatingService.getAssessmentLockState(ASSIGNMENT_ID, STUDENT_ID)
    expect(state.locked).toBe(false)
    expect(state.required_count).toBe(0)
    expect(state.missing).toEqual([])
  })

  it('reports unlocked when gating flag is off, even with required materials', async () => {
    installSupabaseMock({
      gatingEnabled: false,
      required: [
        { id: 'r1', material_id: MATERIAL_A, title: 'Chapter 1', min_progress_percent: 100 },
      ],
      progress: [{ material_id: MATERIAL_A, progress_percent: 0, completed: false }],
    })

    const state = await gatingService.getAssessmentLockState(ASSIGNMENT_ID, STUDENT_ID)
    expect(state.locked).toBe(false)
    expect(state.gating_enabled).toBe(false)
  })

  it('locks the assessment when at least one required material is incomplete', async () => {
    installSupabaseMock({
      gatingEnabled: true,
      required: [
        { id: 'r1', material_id: MATERIAL_A, title: 'Chapter 1', min_progress_percent: 100 },
        { id: 'r2', material_id: MATERIAL_B, title: 'Chapter 2', min_progress_percent: 80 },
      ],
      progress: [
        { material_id: MATERIAL_A, progress_percent: 100, completed: true },
        { material_id: MATERIAL_B, progress_percent: 50, completed: false },
      ],
    })

    const state = await gatingService.getAssessmentLockState(ASSIGNMENT_ID, STUDENT_ID)
    expect(state.locked).toBe(true)
    expect(state.required_count).toBe(2)
    expect(state.satisfied_count).toBe(1)
    expect(state.missing).toHaveLength(1)
    expect(state.missing[0]).toMatchObject({
      material_id: MATERIAL_B,
      material_title: 'Chapter 2',
      min_progress_percent: 80,
      current_progress_percent: 50,
      completed: false,
    })
  })

  it('unlocks once all required materials reach their thresholds', async () => {
    installSupabaseMock({
      gatingEnabled: true,
      required: [
        { id: 'r1', material_id: MATERIAL_A, title: 'Chapter 1', min_progress_percent: 100 },
        { id: 'r2', material_id: MATERIAL_B, title: 'Chapter 2', min_progress_percent: 80 },
      ],
      progress: [
        { material_id: MATERIAL_A, progress_percent: 100, completed: true },
        { material_id: MATERIAL_B, progress_percent: 85, completed: false },
      ],
    })

    const state = await gatingService.getAssessmentLockState(ASSIGNMENT_ID, STUDENT_ID)
    expect(state.locked).toBe(false)
    expect(state.satisfied_count).toBe(2)
    expect(state.missing).toEqual([])
  })

  it('treats completed=true as satisfying the requirement regardless of percent', async () => {
    installSupabaseMock({
      gatingEnabled: true,
      required: [
        { id: 'r1', material_id: MATERIAL_A, title: 'Chapter 1', min_progress_percent: 100 },
      ],
      progress: [
        { material_id: MATERIAL_A, progress_percent: 0, completed: true },
      ],
    })

    const state = await gatingService.getAssessmentLockState(ASSIGNMENT_ID, STUDENT_ID)
    expect(state.locked).toBe(false)
  })

  it('locks when the student has no progress row for a required material', async () => {
    installSupabaseMock({
      gatingEnabled: true,
      required: [
        { id: 'r1', material_id: MATERIAL_A, title: 'Chapter 1', min_progress_percent: 50 },
      ],
      progress: [],
    })

    const state = await gatingService.getAssessmentLockState(ASSIGNMENT_ID, STUDENT_ID)
    expect(state.locked).toBe(true)
    expect(state.missing[0].current_progress_percent).toBe(0)
  })

  describe('assertAssessmentUnlocked', () => {
    it('throws a 423 with missing-list metadata when locked', async () => {
      installSupabaseMock({
        gatingEnabled: true,
        required: [
          { id: 'r1', material_id: MATERIAL_A, title: 'Chapter 1', min_progress_percent: 100 },
        ],
        progress: [{ material_id: MATERIAL_A, progress_percent: 30, completed: false }],
      })

      await expect(
        gatingService.assertAssessmentUnlocked(ASSIGNMENT_ID, STUDENT_ID)
      ).rejects.toMatchObject({
        statusCode: 423,
        details: expect.objectContaining({
          reason: 'lm_gating',
          missing: expect.arrayContaining([
            expect.objectContaining({ material_id: MATERIAL_A }),
          ]),
        }),
      })
    })

    it('resolves silently when unlocked', async () => {
      installSupabaseMock({
        gatingEnabled: true,
        required: [],
        progress: [],
      })

      await expect(
        gatingService.assertAssessmentUnlocked(ASSIGNMENT_ID, STUDENT_ID)
      ).resolves.toBeUndefined()
    })
  })
})
