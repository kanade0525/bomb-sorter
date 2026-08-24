import { describe, expect, it } from 'vitest'
import { TIMING } from '../core/constants'
import { planSteps } from './fixedstep'

describe('planSteps', () => {
  it('60fps 相当では 1 ステップ進む', () => {
    const p = planSteps(0, 1 / 60)
    expect(p.steps).toBe(1)
    expect(p.acc).toBeCloseTo(0, 6)
  })

  it('120fps 相当では 1 フレームおきに進む', () => {
    const a = planSteps(0, 1 / 120)
    expect(a.steps).toBe(0)
    const b = planSteps(a.acc, 1 / 120)
    expect(b.steps).toBe(1)
  })

  it('タブ復帰の巨大 delta でもステップ数が上限で止まる', () => {
    const p = planSteps(0, 300)
    expect(p.steps).toBe(TIMING.MAX_STEPS)
    // 上限に張り付いたら借金は捨てる
    expect(p.acc).toBe(0)
    expect(p.alpha).toBe(0)
  })

  it('進む合計時間は MAX_FRAME_DELTA を超えない', () => {
    const p = planSteps(0, 9999)
    expect(p.steps * TIMING.FIXED_DT).toBeLessThanOrEqual(TIMING.MAX_FRAME_DELTA + 1e-9)
  })

  it('負の delta を渡しても進まない', () => {
    const p = planSteps(0, -5)
    expect(p.steps).toBe(0)
    expect(p.acc).toBe(0)
  })

  it('alpha は 0 以上 1 未満に収まる', () => {
    for (const dt of [0, 0.001, 1 / 120, 1 / 60, 1 / 30, 0.05, 10]) {
      const p = planSteps(0.004, dt)
      expect(p.alpha).toBeGreaterThanOrEqual(0)
      expect(p.alpha).toBeLessThan(1)
    }
  })
})
