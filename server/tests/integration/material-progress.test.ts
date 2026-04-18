import { updateMaterialProgressSchema } from '../../src/types/courses.js'

describe('Material progress schema', () => {
  it('accepts progress percentage updates', () => {
    const result = updateMaterialProgressSchema.safeParse({
      progress_percent: 42.5,
    })

    expect(result.success).toBe(true)
  })

  it('accepts completion and timestamp updates', () => {
    const result = updateMaterialProgressSchema.safeParse({
      completed: true,
      last_viewed_at: '2026-05-01T12:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('rejects empty payloads', () => {
    const result = updateMaterialProgressSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects out-of-range progress percentages', () => {
    const tooLow = updateMaterialProgressSchema.safeParse({
      progress_percent: -1,
    })
    expect(tooLow.success).toBe(false)

    const tooHigh = updateMaterialProgressSchema.safeParse({
      progress_percent: 101,
    })
    expect(tooHigh.success).toBe(false)
  })
})
