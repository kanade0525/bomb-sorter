import { describe, expect, it } from 'vitest'
import { BOMB } from '../core/constants'
import { createRng, nextRange } from '../core/rng'
import type { Bomb, Rect } from '../core/types'
import { computeLayout } from '../view/layout'
import { separateBombs } from './separate'
import { createBomb } from './world'

const FIELD: Rect = computeLayout(360, 640).field
const R = BOMB.RADIUS

function bomb(id: number, x: number, y: number, over: Partial<Bomb> = {}): Bomb {
  return { ...createBomb(id, 'round', x, y, 0, 0, 9, 0), ...over }
}

function gap(a: Bomb, b: Bomb): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 掴まれていない・消滅中でないボムがフィールド内に収まっているか */
function insideField(b: Bomb): boolean {
  return (
    b.x >= FIELD.x + R - 1e-9 &&
    b.x <= FIELD.x + FIELD.w - R + 1e-9 &&
    b.y >= FIELD.y + R - 1e-9 &&
    b.y <= FIELD.y + FIELD.h - R + 1e-9
  )
}

describe('separateBombs', () => {
  it('離れているボムは動かさない', () => {
    const a = bomb(1, 100, 200)
    const b = bomb(2, 100, 200 + R * 2 + 1)
    separateBombs([a, b], FIELD)
    expect(a.y).toBe(200)
    expect(b.y).toBe(200 + R * 2 + 1)
  })

  it('接触ちょうど（距離 = 直径）は動かさない', () => {
    const a = bomb(1, 150, 250)
    const b = bomb(2, 150 + R * 2, 250)
    separateBombs([a, b], FIELD)
    expect(a.x).toBe(150)
    expect(b.x).toBe(150 + R * 2)
  })

  it('重なっていれば直径ぶん離れるまで押し合う', () => {
    const a = bomb(1, 150, 250)
    const b = bomb(2, 160, 250)
    separateBombs([a, b], FIELD)
    expect(gap(a, b)).toBeCloseTo(R * 2, 6)
    // 押しのけは対称。どちらか片方だけが動くのは不自然
    expect(150 - a.x).toBeCloseTo(b.x - 160, 6)
  })

  it('完全に同一座標でも 0 除算せず分離する', () => {
    const a = bomb(1, 180, 300)
    const b = bomb(2, 180, 300)
    separateBombs([a, b], FIELD)
    for (const v of [a.x, a.y, b.x, b.y]) expect(Number.isFinite(v)).toBe(true)
    // 0 除算回避に d = 0.0001 を使っているので、その分だけ直径に届かない
    expect(gap(a, b)).toBeGreaterThanOrEqual(R * 2 - 1e-3)
    // 決め打ちの向き（x 方向）へ逃がす取り決め
    expect(a.y).toBe(300)
    expect(b.y).toBe(300)
  })

  it('同一座標が 3 個でも NaN にならない', () => {
    const bs = [bomb(1, 180, 300), bomb(2, 180, 300), bomb(3, 180, 300)]
    separateBombs(bs, FIELD)
    for (const b of bs) {
      expect(Number.isFinite(b.x)).toBe(true)
      expect(Number.isFinite(b.y)).toBe(true)
    }
  })

  it('掴まれているボムは動かず、相手だけが押しのけられる', () => {
    const held = bomb(1, 150, 250, { grabbedBy: 7 })
    const free = bomb(2, 160, 250)
    separateBombs([held, free], FIELD)
    expect(held.x).toBe(150)
    expect(held.y).toBe(250)
    expect(gap(held, free)).toBeCloseTo(R * 2, 6)
  })

  it('掴まれている側が配列の後ろでも同じ（順序に依存しない）', () => {
    const free = bomb(1, 150, 250)
    const held = bomb(2, 160, 250, { grabbedBy: 7 })
    separateBombs([free, held], FIELD)
    expect(held.x).toBe(160)
    expect(held.y).toBe(250)
    expect(gap(held, free)).toBeCloseTo(R * 2, 6)
  })

  it('両方掴まれているときは何も起きない', () => {
    const a = bomb(1, 150, 250, { grabbedBy: 1 })
    const b = bomb(2, 152, 250, { grabbedBy: 2 })
    separateBombs([a, b], FIELD)
    expect(a.x).toBe(150)
    expect(b.x).toBe(152)
  })

  it('消滅中のボムは押しのけも押しのけられもしない', () => {
    const vanishing = bomb(1, 150, 250, { vanish: 0.5 })
    const free = bomb(2, 152, 250)
    separateBombs([vanishing, free], FIELD)
    expect(vanishing.x).toBe(150)
    expect(free.x).toBe(152)
  })

  it('分離した結果がフィールド外へ出ない（隅で押し合っても）', () => {
    // 左上の隅に 2 個重ねる。素朴に押すと外へ出る位置
    const a = bomb(1, FIELD.x + R, FIELD.y + R)
    const b = bomb(2, FIELD.x + R + 2, FIELD.y + R + 2)
    separateBombs([a, b], FIELD)
    expect(insideField(a)).toBe(true)
    expect(insideField(b)).toBe(true)
  })

  it('掴まれたボムを壁際に押し当てても、押された側はフィールド内に留まる', () => {
    const held = bomb(1, FIELD.x + FIELD.w - R, FIELD.y + 100, { grabbedBy: 3 })
    const free = bomb(2, FIELD.x + FIELD.w - R - 4, FIELD.y + 100)
    separateBombs([held, free], FIELD)
    expect(insideField(free)).toBe(true)
    // 掴まれている側はクランプの対象外。指の位置を勝手に動かさない
    expect(held.x).toBe(FIELD.x + FIELD.w - R)
  })

  it('団子になった 6 個も何回か回せば重なりが解ける', () => {
    const rng = createRng(20240825)
    const bs: Bomb[] = []
    for (let i = 0; i < 6; i++) {
      // 中央付近に半径未満のばらつきで置く = ほぼ全部が重なった状態
      bs.push(
        bomb(
          i + 1,
          FIELD.x + FIELD.w / 2 + nextRange(rng, -6, 6),
          FIELD.y + FIELD.h / 2 + nextRange(rng, -6, 6)
        )
      )
    }
    for (let i = 0; i < 200; i++) separateBombs(bs, FIELD)

    for (let i = 0; i < bs.length; i++) {
      expect(insideField(bs[i]!)).toBe(true)
      for (let j = i + 1; j < bs.length; j++) {
        // 完全収束はしなくても、掴めないほどの重なり（半径未満）は残らないこと
        expect(gap(bs[i]!, bs[j]!), `${i} と ${j} が重なったまま`).toBeGreaterThan(R)
      }
    }
  })

  it('フィールドいっぱいに詰めても座標が有限のまま収まる', () => {
    const bs: Bomb[] = []
    for (let i = 0; i < 12; i++) bs.push(bomb(i + 1, FIELD.x + R, FIELD.y + R))
    for (let i = 0; i < 300; i++) separateBombs(bs, FIELD)
    for (const b of bs) {
      expect(Number.isFinite(b.x)).toBe(true)
      expect(Number.isFinite(b.y)).toBe(true)
      expect(insideField(b)).toBe(true)
    }
  })

  it('空配列や 1 個でも落ちない', () => {
    expect(() => separateBombs([], FIELD)).not.toThrow()
    const only = bomb(1, 100, 200)
    expect(() => separateBombs([only], FIELD)).not.toThrow()
    expect(only.x).toBe(100)
  })

  it('速度は書き換えない（跳ね返りは drift の責務）', () => {
    const a = bomb(1, 150, 250, { vx: 5, vy: -7 })
    const b = bomb(2, 158, 250, { vx: -3, vy: 2 })
    separateBombs([a, b], FIELD)
    expect(a.vx).toBe(5)
    expect(a.vy).toBe(-7)
    expect(b.vx).toBe(-3)
    expect(b.vy).toBe(2)
  })

  it('フィールドの外にいるボムは 1 回の呼び出しで内側へ戻される', () => {
    const stray = bomb(1, -500, -500)
    separateBombs([stray], FIELD)
    expect(insideField(stray)).toBe(true)
  })
})
