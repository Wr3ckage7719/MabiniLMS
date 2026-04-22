import {
  trackMaterialDownloadSchema,
  trackMaterialProgressSchema,
  trackMaterialViewEndSchema,
  trackMaterialViewStartSchema,
  updateMaterialProgressSchema,
} from '../../src/types/courses.js'

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

  it('accepts valid view-start tracking payloads', () => {
    const result = trackMaterialViewStartSchema.safeParse({
      user_agent: 'Mozilla/5.0',
      device_type: 'desktop',
    })

    expect(result.success).toBe(true)
  })

  it('accepts valid view-end tracking payloads', () => {
    const result = trackMaterialViewEndSchema.safeParse({
      time_spent_seconds: 215,
      final_scroll_percent: 82.5,
      completed: false,
      page_number: 4,
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid view-end tracking payloads', () => {
    const result = trackMaterialViewEndSchema.safeParse({
      time_spent_seconds: -1,
      final_scroll_percent: 150,
    })

    expect(result.success).toBe(false)
  })

  it('accepts valid progress tracking payloads', () => {
    const result = trackMaterialProgressSchema.safeParse({
      scroll_percent: 64.2,
      page_number: 3,
      pages_viewed: [1, 2, 3],
      active_seconds: 5,
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid progress tracking payloads', () => {
    const result = trackMaterialProgressSchema.safeParse({
      scroll_percent: -0.1,
      pages_viewed: [0],
    })

    expect(result.success).toBe(false)

    const invalidActiveSeconds = trackMaterialProgressSchema.safeParse({
      scroll_percent: 10,
      active_seconds: -1,
    })

    expect(invalidActiveSeconds.success).toBe(false)
  })

  it('accepts download tracking metadata payloads', () => {
    const result = trackMaterialDownloadSchema.safeParse({
      file_name: 'lecture-1.pdf',
      file_size: 1024,
    })

    expect(result.success).toBe(true)
  })
})
