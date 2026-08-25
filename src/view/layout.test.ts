import { describe, expect, it } from 'vitest'
import { FIELD } from '../core/constants'
import { computeFit, computeLayout } from './layout'

/** 縦横どちらでも、短い方の辺が 360 に固定されていること */
describe('computeFit', () => {
  it('横持ちでは論理高さが固定される', () => {
    for (const [w, h] of [
      [568, 320],
      [844, 390],
      [932, 430],
      [1280, 720],
      [2560, 1440],
    ] as const) {
      const fit = computeFit(w, h)
      expect(fit.logicalH, `${w}x${h}`).toBe(FIELD.LOGICAL_SHORT)
      expect(fit.portrait).toBe(false)
    }
  })

  it('縦持ちでは論理幅が固定される', () => {
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [430, 932],
      [768, 1024],
    ] as const) {
      const fit = computeFit(w, h)
      expect(fit.logicalW, `${w}x${h}`).toBe(FIELD.LOGICAL_SHORT)
      expect(fit.portrait).toBe(true)
    }
  })

  it('長い方の辺は向きごとの範囲にクランプされる', () => {
    expect(computeFit(5000, 360).logicalW).toBe(FIELD.LAND_LONG_MAX)
    expect(computeFit(400, 360).logicalW).toBe(FIELD.LAND_LONG_MIN)
    expect(computeFit(360, 5000).logicalH).toBe(FIELD.PORT_LONG_MAX)
    expect(computeFit(360, 400).logicalH).toBe(FIELD.PORT_LONG_MIN)
  })

  it('横持ちのスマホでは実比率どおりの幅になる', () => {
    const fit = computeFit(844, 390)
    expect(fit.logicalW).toBe(Math.round((360 * 844) / 390))
    expect(fit.logicalW).toBeGreaterThan(FIELD.LAND_LONG_MIN)
    expect(fit.logicalW).toBeLessThan(FIELD.LAND_LONG_MAX)
  })

  it('縦持ちのスマホでは実比率どおりの高さになる', () => {
    const fit = computeFit(390, 844)
    expect(fit.logicalH).toBe(Math.round((360 * 844) / 390))
    expect(fit.logicalH).toBeGreaterThan(FIELD.PORT_LONG_MIN)
    expect(fit.logicalH).toBeLessThan(FIELD.PORT_LONG_MAX)
  })

  it('正方形は横扱いにする（どちらかに倒す必要がある）', () => {
    expect(computeFit(500, 500).portrait).toBe(false)
  })

  it('レターボックスは上下左右で均等に入る', () => {
    for (const [w, h] of [
      [1400, 500],
      [500, 1400],
    ] as const) {
      const fit = computeFit(w, h)
      expect(fit.offsetX * 2 + fit.logicalW * fit.scale).toBeCloseTo(w, 6)
      expect(fit.offsetY * 2 + fit.logicalH * fit.scale).toBeCloseTo(h, 6)
    }
  })

  it('大画面では拡大率が上限で止まる', () => {
    const fit = computeFit(2560, 1440)
    expect(fit.scale).toBe(FIELD.MAX_SCALE)
    expect(fit.offsetX).toBeGreaterThan(0)
  })

  it('0 サイズでも壊れない', () => {
    const fit = computeFit(0, 0)
    expect(Number.isFinite(fit.scale)).toBe(true)
    expect(fit.scale).toBeGreaterThan(0)
  })
})

describe('computeLayout（横持ち）', () => {
  it('箱は左右の端にあり、左が赤・右が黒で固定されている', () => {
    const l = computeLayout(700, 360)
    expect(l.zones[0]!.kind).toBe('red')
    expect(l.zones[1]!.kind).toBe('black')
    expect(l.zones[0]!.rect.x).toBeLessThan(l.logicalW * 0.2)
    expect(l.zones[1]!.rect.x + l.zones[1]!.rect.w).toBeGreaterThan(l.logicalW * 0.8)
  })

  it('画面幅が変わっても箱の幅は変わらず、差はフィールドが吸収する', () => {
    const a = computeLayout(FIELD.LAND_LONG_MIN, 360)
    const b = computeLayout(FIELD.LAND_LONG_MAX, 360)
    expect(a.zones[0]!.rect.w).toBeCloseTo(b.zones[0]!.rect.w, 6)
    expect(b.field.w - a.field.w).toBeCloseTo(FIELD.LAND_LONG_MAX - FIELD.LAND_LONG_MIN, 6)
  })

  it('フィールドは 2 つの箱の間にあり、どちらとも重ならない', () => {
    for (const w of [560, 640, 780, 900]) {
      const l = computeLayout(w, 360)
      expect(l.field.x).toBeGreaterThanOrEqual(l.zones[0]!.rect.x + l.zones[0]!.rect.w)
      expect(l.field.x + l.field.w).toBeLessThanOrEqual(l.zones[1]!.rect.x)
    }
  })
})

describe('computeLayout（縦持ち）', () => {
  it('箱は下に 2 つ並び、左が赤・右が黒で固定されている', () => {
    const l = computeLayout(360, 700)
    expect(l.zones[0]!.kind).toBe('red')
    expect(l.zones[1]!.kind).toBe('black')
    expect(l.zones[0]!.rect.x).toBeLessThan(l.zones[1]!.rect.x)
    // どちらも画面の下半分にある
    for (const z of l.zones) {
      expect(z.rect.y).toBeGreaterThan(l.logicalH * 0.5)
    }
  })

  it('フィールドは箱の上にあり、重ならない', () => {
    for (const h of [540, 640, 700, 780]) {
      const l = computeLayout(360, h)
      expect(l.field.y + l.field.h).toBeLessThanOrEqual(l.zones[0]!.rect.y)
      expect(l.field.h).toBeGreaterThan(0)
    }
  })

  it('画面が高くなってもボムの大きさに効く幅は変わらない', () => {
    const a = computeLayout(360, 540)
    const b = computeLayout(360, 780)
    expect(a.field.w).toBeCloseTo(b.field.w, 6)
    expect(b.field.h - a.field.h).toBeGreaterThan(180)
  })

  it('2 つの箱は同じ大きさで、左右に並んでいる', () => {
    const l = computeLayout(360, 700)
    expect(l.zones[0]!.rect.w).toBeCloseTo(l.zones[1]!.rect.w, 6)
    expect(l.zones[0]!.rect.y).toBe(l.zones[1]!.rect.y)
    expect(l.zones[0]!.rect.h).toBe(l.zones[1]!.rect.h)
  })

  it('箱の下端は画面の下端より上にある', () => {
    const l = computeLayout(360, 700, { top: 47, right: 0, bottom: 34, left: 0 })
    for (const z of l.zones) {
      expect(z.rect.y + z.rect.h).toBeLessThanOrEqual(700 - 34)
    }
  })
})

describe('computeLayout（向きによらず成り立つこと）', () => {
  const cases = [
    { name: '横持ち', w: 760, h: 360 },
    { name: '縦持ち', w: 360, h: 700 },
    { name: '横持ち・最小', w: 560, h: 360 },
    { name: '縦持ち・最小', w: 360, h: 540 },
  ]

  for (const c of cases) {
    it(`${c.name}: 箱もフィールドも HUD の下から始まる`, () => {
      const l = computeLayout(c.w, c.h, { top: 24, right: 0, bottom: 0, left: 0 })
      expect(l.zones[0]!.rect.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h)
      expect(l.field.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h)
    })

    it(`${c.name}: 箱の内側は箱の中に収まっている`, () => {
      const l = computeLayout(c.w, c.h)
      for (const z of l.zones) {
        expect(z.inner.x).toBeGreaterThanOrEqual(z.rect.x)
        expect(z.inner.y).toBeGreaterThanOrEqual(z.rect.y)
        expect(z.inner.x + z.inner.w).toBeLessThanOrEqual(z.rect.x + z.rect.w)
        expect(z.inner.y + z.inner.h).toBeLessThanOrEqual(z.rect.y + z.rect.h)
        expect(z.inner.w).toBeGreaterThan(0)
        expect(z.inner.h).toBeGreaterThan(0)
      }
    })

    it(`${c.name}: safe-area が大きくても潰れない`, () => {
      const l = computeLayout(c.w, c.h, { top: 30, right: 44, bottom: 34, left: 44 })
      expect(l.field.w).toBeGreaterThan(0)
      expect(l.field.h).toBeGreaterThan(0)
      expect(l.zones[0]!.rect.w).toBeGreaterThan(0)
      expect(l.zones[0]!.rect.h).toBeGreaterThan(0)
    })

    it(`${c.name}: すべての矩形が画面の中に収まる`, () => {
      const l = computeLayout(c.w, c.h)
      const rects = [l.hud, l.field, ...l.zones.map((z) => z.rect)]
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w).toBeLessThanOrEqual(l.logicalW)
        expect(r.y + r.h).toBeLessThanOrEqual(l.logicalH)
      }
    })

    it(`${c.name}: computeFit と computeLayout の向きの判定が一致する`, () => {
      const fit = computeFit(c.w, c.h)
      const l = computeLayout(fit.logicalW, fit.logicalH)
      // 縦なら箱は上下に、横なら左右に離れている
      const sideBySideVertically = l.zones[0]!.rect.y === l.zones[1]!.rect.y
      expect(sideBySideVertically).toBe(true)
      const portraitLike = l.logicalH > l.logicalW
      expect(portraitLike).toBe(fit.portrait)
    })
  }
})
