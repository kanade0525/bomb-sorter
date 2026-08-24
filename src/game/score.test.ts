import { describe, expect, it } from 'vitest'
import { SCORE } from '../core/constants'
import { comboMultiplier, scoreGain } from './score'

describe('comboMultiplier', () => {
  it('初成功は 1.0 倍', () => {
    expect(comboMultiplier(0)).toBe(1)
  })

  it('1 連鎖ごとに COMBO_STEP ずつ上がる', () => {
    expect(comboMultiplier(1)).toBeCloseTo(1.2, 6)
    expect(comboMultiplier(5)).toBeCloseTo(2.0, 6)
  })

  it('上限で頭打ちになる', () => {
    expect(comboMultiplier(20)).toBeCloseTo(SCORE.COMBO_MAX_MULT, 6)
    expect(comboMultiplier(1000)).toBe(SCORE.COMBO_MAX_MULT)
  })

  it('負の値でも 1.0 を下回らない', () => {
    expect(comboMultiplier(-5)).toBe(1)
  })
})

describe('scoreGain', () => {
  it('導火線が満タンなら基礎点＋ボーナス満額', () => {
    expect(scoreGain(1, 0)).toBe(SCORE.BASE + SCORE.FUSE_BONUS_MAX)
  })

  it('導火線が尽きかけなら基礎点のみ', () => {
    expect(scoreGain(0, 0)).toBe(SCORE.BASE)
  })

  it('コンボ倍率が掛かる', () => {
    expect(scoreGain(0.8, 5)).toBe(280)
  })

  it('比率が範囲外でもクランプされる', () => {
    expect(scoreGain(5, 0)).toBe(SCORE.BASE + SCORE.FUSE_BONUS_MAX)
    expect(scoreGain(-5, 0)).toBe(SCORE.BASE)
  })

  it('整数を返し、負にならない', () => {
    for (let c = 0; c < 30; c++) {
      for (const r of [0, 0.13, 0.5, 0.777, 1]) {
        const v = scoreGain(r, c)
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
      }
    }
  })
})
