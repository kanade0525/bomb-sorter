import { describe, expect, it } from 'vitest'
import { createRng, nextFloat, nextRange } from './rng'

describe('rng', () => {
  it('同じシードからは同じ列が出る', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const sa = Array.from({ length: 20 }, () => nextFloat(a))
    const sb = Array.from({ length: 20 }, () => nextFloat(b))
    expect(sa).toEqual(sb)
  })

  it('違うシードからは違う列が出る', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(nextFloat(a)).not.toBe(nextFloat(b))
  })

  it('0 を渡しても縮退せずばらける', () => {
    const r = createRng(0)
    const xs = Array.from({ length: 10 }, () => nextFloat(r))
    expect(new Set(xs).size).toBe(10)
  })

  it('値は 0 以上 1 未満に収まる', () => {
    const r = createRng(999)
    for (let i = 0; i < 5000; i++) {
      const v = nextFloat(r)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('nextRange は指定範囲に収まる', () => {
    const r = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = nextRange(r, -5, 5)
      expect(v).toBeGreaterThanOrEqual(-5)
      expect(v).toBeLessThan(5)
    }
  })
})
