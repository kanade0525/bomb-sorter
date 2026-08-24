import { describe, expect, it } from 'vitest'
import { FIELD } from '../core/constants'
import { computeFit, computeLayout } from './layout'

describe('computeFit', () => {
  it('論理幅は常に固定される', () => {
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [430, 932],
      [768, 1024],
      [1440, 900],
    ] as const) {
      expect(computeFit(w, h).logicalW).toBe(FIELD.LOGICAL_W)
    }
  })

  it('論理高さは範囲内にクランプされる', () => {
    // 極端に縦長・横長でも範囲を出ない
    expect(computeFit(360, 5000).logicalH).toBe(FIELD.H_MAX)
    expect(computeFit(360, 100).logicalH).toBe(FIELD.H_MIN)
  })

  it('iPhone 相当の縦長画面では上限に近い高さになる', () => {
    const fit = computeFit(390, 844)
    expect(fit.logicalH).toBe(FIELD.H_MAX)
    expect(fit.scale).toBeGreaterThan(0)
  })

  it('16:9 では論理高さが範囲内の実寸になる', () => {
    const fit = computeFit(360, 640)
    expect(fit.logicalH).toBe(640)
    expect(fit.scale).toBeCloseTo(1, 6)
    expect(fit.offsetX).toBeCloseTo(0, 6)
    expect(fit.offsetY).toBeCloseTo(0, 6)
  })

  it('レターボックスは左右均等に入る', () => {
    const fit = computeFit(1000, 600)
    expect(fit.offsetX).toBeGreaterThan(0)
    expect(fit.offsetX * 2 + FIELD.LOGICAL_W * fit.scale).toBeCloseTo(1000, 6)
  })

  it('0 サイズでも壊れない', () => {
    const fit = computeFit(0, 0)
    expect(Number.isFinite(fit.scale)).toBe(true)
    expect(fit.scale).toBeGreaterThan(0)
  })
})

describe('computeLayout', () => {
  it('画面比が違ってもゾーンの幅と高さは変わらない', () => {
    const a = computeLayout(360, 560)
    const b = computeLayout(360, 760)
    expect(a.zones[0]!.rect.w).toBeCloseTo(b.zones[0]!.rect.w, 6)
    expect(a.zones[0]!.rect.h).toBe(b.zones[0]!.rect.h)
  })

  it('高さの差はフィールドの縦余白として吸収される', () => {
    const a = computeLayout(360, 560)
    const b = computeLayout(360, 760)
    expect(b.field.h - a.field.h).toBeCloseTo(200, 6)
  })

  it('safe-area の分だけゾーン下端が持ち上がる', () => {
    const plain = computeLayout(360, 760)
    const inset = computeLayout(360, 760, { top: 0, right: 0, bottom: 34, left: 0 })
    const plainBottom = plain.zones[0]!.rect.y + plain.zones[0]!.rect.h
    const insetBottom = inset.zones[0]!.rect.y + inset.zones[0]!.rect.h
    expect(plainBottom - insetBottom).toBeCloseTo(34, 6)
  })

  it('ゾーン下端は必ず画面下端より上にある（ホームインジケータを避ける）', () => {
    const l = computeLayout(360, 760, { top: 47, right: 0, bottom: 34, left: 0 })
    const bottom = l.zones[0]!.rect.y + l.zones[0]!.rect.h
    expect(bottom).toBeLessThanOrEqual(760 - FIELD.ZONE_BOTTOM_PAD - 34)
  })

  it('フィールドとゾーンは重ならない', () => {
    for (const h of [560, 640, 700, 760]) {
      const l = computeLayout(360, h)
      expect(l.field.y + l.field.h).toBeLessThanOrEqual(l.zones[0]!.rect.y)
    }
  })

  it('フィールドは HUD の下から始まる', () => {
    const l = computeLayout(360, 640)
    expect(l.field.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h)
  })

  it('safe-area が大きくてもフィールドの高さが潰れない', () => {
    const l = computeLayout(360, 560, { top: 60, right: 20, bottom: 40, left: 20 })
    expect(l.field.h).toBeGreaterThan(0)
    expect(l.field.w).toBeGreaterThan(0)
    expect(l.zones[0]!.rect.w).toBeGreaterThan(0)
  })
})
