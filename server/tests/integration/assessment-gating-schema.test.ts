import {
  setRequiredMaterialsSchema,
  requiredMaterialEntrySchema,
} from '../../src/types/assignments.js'

describe('Required-materials schemas', () => {
  describe('requiredMaterialEntrySchema', () => {
    it('accepts a bare material_id (defaulting threshold)', () => {
      const result = requiredMaterialEntrySchema.safeParse({
        material_id: '11111111-1111-1111-1111-111111111111',
      })
      expect(result.success).toBe(true)
    })

    it('accepts a custom threshold', () => {
      const result = requiredMaterialEntrySchema.safeParse({
        material_id: '11111111-1111-1111-1111-111111111111',
        min_progress_percent: 80,
      })
      expect(result.success).toBe(true)
    })

    it('rejects non-uuid material_id', () => {
      const result = requiredMaterialEntrySchema.safeParse({
        material_id: 'not-a-uuid',
      })
      expect(result.success).toBe(false)
    })

    it('rejects out-of-range thresholds', () => {
      const tooLow = requiredMaterialEntrySchema.safeParse({
        material_id: '11111111-1111-1111-1111-111111111111',
        min_progress_percent: -1,
      })
      expect(tooLow.success).toBe(false)

      const tooHigh = requiredMaterialEntrySchema.safeParse({
        material_id: '11111111-1111-1111-1111-111111111111',
        min_progress_percent: 101,
      })
      expect(tooHigh.success).toBe(false)
    })
  })

  describe('setRequiredMaterialsSchema', () => {
    it('accepts an empty list (used to clear gating)', () => {
      const result = setRequiredMaterialsSchema.safeParse({ materials: [] })
      expect(result.success).toBe(true)
    })

    it('accepts the enabled flag', () => {
      const result = setRequiredMaterialsSchema.safeParse({
        enabled: true,
        materials: [
          {
            material_id: '11111111-1111-1111-1111-111111111111',
            min_progress_percent: 100,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('rejects more than 50 entries', () => {
      const materials = Array.from({ length: 51 }, (_, i) => ({
        material_id: `11111111-1111-1111-1111-${String(i + 1).padStart(12, '0')}`,
      }))
      const result = setRequiredMaterialsSchema.safeParse({ materials })
      expect(result.success).toBe(false)
    })

    it('rejects when materials field is missing', () => {
      const result = setRequiredMaterialsSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })
})
