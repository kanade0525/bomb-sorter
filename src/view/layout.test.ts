import { describe, expect, it } from 'vitest'
import { FIELD } from '../core/constants'
import { computeFit, computeLayout } from './layout'

describe('computeFit', () => {
  it('論理高さは常に固定される', () => {
    for (const [w, h] of [
      [568, 320],
      [844, 390],
      [932, 430],
      [1024, 768],
      [1440, 900],
    ] as const) {
      expect(computeFit(w, h).logicalH).toBe(FIELD.LOGICAL_H)
    }
  })

  it('論理幅は範囲内にクランプされる', () => {
    // 極端に横長・縦長でも範囲を出ない
    expect(computeFit(5000, 360).logicalW).toBe(FIELD.W_MAX)
    expect(computeFit(200, 360).logicalW).toBe(FIELD.W_MIN)
  })

  it('横持ちのスマホでは実比率どおりの幅になる', () => {
    const fit = computeFit(844, 390)
    expect(fit.logicalW).toBe(Math.round((360 * 844) / 390))
    expect(fit.logicalW).toBeGreaterThan(FIELD.W_MIN)
    expect(fit.logicalW).toBeLessThan(FIELD.W_MAX)
    expect(fit.portrait).toBe(false)
  })

  it('縦持ちを検出できる', () => {
    expect(computeFit(390, 844).portrait).toBe(true)
    expect(computeFit(844, 390).portrait).toBe(false)
    // 正方形は縦扱いにしない
    expect(computeFit(500, 500).portrait).toBe(false)
  })

  it('レターボックスは上下左右で均等に入る', () => {
    const fit = computeFit(1400, 500)
    expect(fit.offsetX * 2 + fit.logicalW * fit.scale).toBeCloseTo(1400, 6)
    expect(fit.offsetY * 2 + fit.logicalH * fit.scale).toBeCloseTo(500, 6)
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

describe('computeLayout', () => {
  it('箱は左右の端にあり、左が赤・右が黒で固定されている', () => {
    const l = computeLayout(700, 360)
    expect(l.zones[0]!.kind).toBe('red')
    expect(l.zones[1]!.kind).toBe('black')
    expect(l.zones[0]!.rect.x).toBeLessThan(l.zones[1]!.rect.x)
    // 左の箱は画面の左端寄り、右の箱は右端寄り
    expect(l.zones[0]!.rect.x).toBeLessThan(l.logicalW * 0.2)
    expect(l.zones[1]!.rect.x + l.zones[1]!.rect.w).toBeGreaterThan(l.logicalW * 0.8)
  })

  it('画面幅が変わっても箱の幅は変わらず、差はフィールドが吸収する', () => {
    const a = computeLayout(FIELD.W_MIN, 360)
    const b = computeLayout(FIELD.W_MAX, 360)
    expect(a.zones[0]!.rect.w).toBeCloseTo(b.zones[0]!.rect.w, 6)
    expect(b.field.w - a.field.w).toBeCloseTo(FIELD.W_MAX - FIELD.W_MIN, 6)
  })

  it('フィールドは 2 つの箱の間にあり、どちらとも重ならない', () => {
    for (const w of [560, 640, 780, 900]) {
      const l = computeLayout(w, 360)
      expect(l.field.x).toBeGreaterThanOrEqual(l.zones[0]!.rect.x + l.zones[0]!.rect.w)
      expect(l.field.x + l.field.w).toBeLessThanOrEqual(l.zones[1]!.rect.x)
      expect(l.field.w).toBeGreaterThan(0)
    }
  })

  it('safe-area の分だけ箱が内側へ寄る', () => {
    const plain = computeLayout(760, 360)
    const inset = computeLayout(760, 360, { top: 0, right: 44, bottom: 0, left: 44 })
    expect(inset.zones[0]!.rect.x - plain.zones[0]!.rect.x).toBeCloseTo(44, 6)
    const plainRight = plain.zones[1]!.rect.x + plain.zones[1]!.rect.w
    const insetRight = inset.zones[1]!.rect.x + inset.zones[1]!.rect.w
    expect(plainRight - insetRight).toBeCloseTo(44, 6)
  })

  it('箱もフィールドも HUD の下から始まる', () => {
    const l = computeLayout(760, 360, { top: 24, right: 0, bottom: 0, left: 0 })
    expect(l.zones[0]!.rect.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h)
    expect(l.field.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h)
  })

  it('箱の下端は画面の下端より上にある', () => {
    const l = computeLayout(760, 360, { top: 0, right: 0, bottom: 21, left: 0 })
    for (const z of l.zones) {
      expect(z.rect.y + z.rect.h).toBeLessThanOrEqual(360 - 21)
    }
  })

  it('箱の内側は箱の中に収まっている', () => {
    for (const w of [560, 700, 900]) {
      const l = computeLayout(w, 360)
      for (const z of l.zones) {
        expect(z.inner.x).toBeGreaterThanOrEqual(z.rect.x)
        expect(z.inner.y).toBeGreaterThanOrEqual(z.rect.y)
        expect(z.inner.x + z.inner.w).toBeLessThanOrEqual(z.rect.x + z.rect.w)
        expect(z.inner.y + z.inner.h).toBeLessThanOrEqual(z.rect.y + z.rect.h)
        expect(z.inner.w).toBeGreaterThan(0)
        expect(z.inner.h).toBeGreaterThan(0)
      }
    }
  })

  it('safe-area が大きくてもフィールドが潰れない', () => {
    const l = computeLayout(560, 360, { top: 30, right: 44, bottom: 21, left: 44 })
    expect(l.field.w).toBeGreaterThan(0)
    expect(l.field.h).toBeGreaterThan(0)
    expect(l.zones[0]!.rect.w).toBeGreaterThan(0)
  })
})
