import { deterministicIndexOrder } from '../../src/services/exams.js'

describe('exam randomization (LMS-011)', () => {
  it('produces stable order for the same seed', () => {
    const seed = 1337
    const first = deterministicIndexOrder(12, seed)
    const second = deterministicIndexOrder(12, seed)

    expect(second).toEqual(first)
  })

  it('produces a valid permutation without duplicates', () => {
    const order = deterministicIndexOrder(20, 2026)

    expect(order).toHaveLength(20)
    expect(new Set(order).size).toBe(20)
    expect(order.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_value, index) => index)
    )
  })

  it('changes order when seed changes', () => {
    const baseline = deterministicIndexOrder(15, 500)
    const candidates = [501, 777, 2027].map((seed) => deterministicIndexOrder(15, seed))

    const foundDifferentOrder = candidates.some((candidate) => {
      return JSON.stringify(candidate) !== JSON.stringify(baseline)
    })

    expect(foundDifferentOrder).toBe(true)
  })
})
