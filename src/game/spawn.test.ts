import { describe, expect, it } from 'vitest'
import { BOMB, SPAWN } from '../core/constants'
import { createRng } from '../core/rng'
import type { Rect, RngState } from '../core/types'
import { computeLayout } from '../view/layout'
import { driftScale, spawnInterval } from './difficulty'
import { findSpawnPos, initialVelocity, nextInterval, pickKind } from './spawn'

const FIELD: Rect = computeLayout(360, 640).field
const R = BOMB.RADIUS

describe('nextInterval', () => {
  it('ゆらぎは常に spawnInterval * (1 ± JITTER) の中に収まる', () => {
    const rng = createRng(9731)
    for (const t of [0, 1, 10, 30, 60, 120, 300, 600, 3600]) {
      const base = spawnInterval(t)
      for (let i = 0; i < 500; i++) {
        const v = nextInterval(t, rng)
        expect(v, `t=${t}`).toBeGreaterThanOrEqual(base * (1 - SPAWN.JITTER))
        expect(v, `t=${t}`).toBeLessThanOrEqual(base * (1 + SPAWN.JITTER))
      }
    }
  })

  it('必ず正の値。0 以下だと 1 フレームに何度もスポーンしうる', () => {
    const rng = createRng(4242)
    for (let i = 0; i < 2000; i++) {
      expect(nextInterval(i / 10, rng)).toBeGreaterThan(0)
    }
  })

  it('ゆらぎの幅を実際に使い切っている（定数を無視していない）', () => {
    const rng = createRng(777)
    const base = spawnInterval(0)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 3000; i++) {
      const v = nextInterval(0, rng)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    // 端の 95% まで到達していれば JITTER が効いていると言える
    expect(min).toBeLessThan(base * (1 - SPAWN.JITTER * 0.95))
    expect(max).toBeGreaterThan(base * (1 + SPAWN.JITTER * 0.95))
  })

  it('負の時刻でも下限より短くならない', () => {
    const rng = createRng(5)
    for (let i = 0; i < 200; i++) {
      const v = nextInterval(-100, rng)
      expect(v).toBeGreaterThanOrEqual(spawnInterval(0) * (1 - SPAWN.JITTER))
    }
  })
})

describe('pickKind', () => {
  it('lastKind が null なら乱数だけで決まる', () => {
    const rng = createRng(1)
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(pickKind(rng, null, 0))
    expect(seen.size).toBe(2)
  })

  it('run が上限未満なら強制されない（両方の形が出る）', () => {
    for (const run of [0, 1, SPAWN.MAX_SAME_KIND_RUN - 1]) {
      const rng = createRng(31 + run)
      const seen = new Set<string>()
      for (let i = 0; i < 200; i++) seen.add(pickKind(rng, 'round', run))
      expect(seen.size, `run=${run} で片方に固定されている`).toBe(2)
    }
  })

  it('run が上限に達すると必ず反対の形を返す', () => {
    const rng = createRng(99)
    for (let i = 0; i < 200; i++) {
      expect(pickKind(rng, 'round', SPAWN.MAX_SAME_KIND_RUN)).toBe('square')
      expect(pickKind(rng, 'square', SPAWN.MAX_SAME_KIND_RUN)).toBe('round')
    }
  })

  it('境界（run = 2 / 3 / 4）の挙動が MAX_SAME_KIND_RUN と一致する', () => {
    expect(SPAWN.MAX_SAME_KIND_RUN).toBe(3)
    const forced = (run: number) => {
      const rng = createRng(1234)
      const out = new Set<string>()
      for (let i = 0; i < 300; i++) out.add(pickKind(rng, 'round', run))
      return out.size === 1 && out.has('square')
    }
    expect(forced(2)).toBe(false)
    expect(forced(3)).toBe(true)
    expect(forced(4)).toBe(true)
  })

  it('強制時は乱数を消費しない（決定性の担保）', () => {
    // 強制されるかどうかで rng の進み方が変わると、同じシードから同じ展開が出なくなる
    const rng: RngState = createRng(555)
    const before = rng.s
    pickKind(rng, 'round', SPAWN.MAX_SAME_KIND_RUN)
    expect(rng.s).toBe(before)
  })

  it('run が上限未満のときはおおよそ 50/50 に散る', () => {
    const rng = createRng(2468)
    let round = 0
    const n = 4000
    for (let i = 0; i < n; i++) if (pickKind(rng, null, 0) === 'round') round++
    expect(round / n).toBeGreaterThan(0.45)
    expect(round / n).toBeLessThan(0.55)
  })
})

describe('findSpawnPos', () => {
  const inside = (p: { x: number; y: number }) =>
    p.x >= FIELD.x + R - 1e-9 &&
    p.x <= FIELD.x + FIELD.w - R + 1e-9 &&
    p.y >= FIELD.y + R - 1e-9 &&
    p.y <= FIELD.y + FIELD.h - R + 1e-9

  it('既存ボムが無いとき、必ずフィールドの内側（半径ぶん内側）を返す', () => {
    const rng = createRng(13)
    for (let i = 0; i < 2000; i++) {
      const p = findSpawnPos([], FIELD, rng)
      expect(inside(p), `${p.x},${p.y}`).toBe(true)
    }
  })

  it('上寄りに出る（漂って親指圏へ降りてくる設計）', () => {
    const rng = createRng(17)
    for (let i = 0; i < 500; i++) {
      const p = findSpawnPos([], FIELD, rng)
      expect(p.y).toBeLessThanOrEqual(FIELD.y + Math.max(R * 2, FIELD.h * 0.45) + 1e-9)
    }
  })

  it('空きがあるなら既存ボムから SPAWN_MIN_GAP ぶん離れた位置を選ぶ', () => {
    // 空きが十分あれば 12 回の試行で必ず見つかる（外れ続ける確率は 1e-10 未満）
    const rng = createRng(23)
    const minGap = R * BOMB.SPAWN_MIN_GAP
    const existing = [{ x: FIELD.x + FIELD.w / 2, y: FIELD.y + 40 }]
    for (let i = 0; i < 500; i++) {
      const p = findSpawnPos(existing, FIELD, rng)
      expect(inside(p)).toBe(true)
      const d = Math.hypot(p.x - existing[0]!.x, p.y - existing[0]!.y)
      expect(d, `${i} 回目が近すぎる`).toBeGreaterThanOrEqual(minGap)
    }
  })

  it('空きが無いほど密集していてもフィールド内を返す', () => {
    const rng = createRng(31)
    // 上半分を格子で埋め尽くして、離れた場所が存在しない状態を作る
    const existing: { x: number; y: number }[] = []
    for (let x = FIELD.x; x <= FIELD.x + FIELD.w; x += 8) {
      for (let y = FIELD.y; y <= FIELD.y + FIELD.h; y += 8) existing.push({ x, y })
    }
    for (let i = 0; i < 300; i++) {
      const p = findSpawnPos(existing, FIELD, rng)
      expect(inside(p), `${p.x},${p.y}`).toBe(true)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('高さが下限まで縮んだフィールドでも内側を返す', () => {
    // computeLayout は field.h に 80 の下限を持つ。その最小ケースで y 範囲が破綻しないか
    const tiny: Rect = { x: 12, y: 100, w: 336, h: 80 }
    const rng = createRng(37)
    for (let i = 0; i < 500; i++) {
      const p = findSpawnPos([], tiny, rng)
      expect(p.x).toBeGreaterThanOrEqual(tiny.x + R)
      expect(p.x).toBeLessThanOrEqual(tiny.x + tiny.w - R)
      expect(p.y).toBeGreaterThanOrEqual(tiny.y + R)
      expect(p.y, `y=${p.y}`).toBeLessThanOrEqual(tiny.y + tiny.h - R)
    }
  })

  it('セーフエリアを差し引いた実機相当のレイアウトでも内側を返す', () => {
    const l = computeLayout(360, 760, { top: 59, right: 0, bottom: 34, left: 0 })
    const rng = createRng(41)
    for (let i = 0; i < 500; i++) {
      const p = findSpawnPos([], l.field, rng)
      expect(p.x).toBeGreaterThanOrEqual(l.field.x + R)
      expect(p.x).toBeLessThanOrEqual(l.field.x + l.field.w - R)
      expect(p.y).toBeGreaterThanOrEqual(l.field.y + R)
      expect(p.y).toBeLessThanOrEqual(l.field.y + l.field.h - R)
    }
  })

  it('同じシードからは同じ位置が出る', () => {
    const a = createRng(4242)
    const b = createRng(4242)
    expect(findSpawnPos([], FIELD, a)).toEqual(findSpawnPos([], FIELD, b))
  })
})

describe('initialVelocity', () => {
  it('速さが DRIFT_BASE * scale * 1.2 の上限内に収まる', () => {
    const rng = createRng(53)
    for (const scale of [1, 1.5, 2, BOMB.DRIFT_MAX_SCALE]) {
      const max = BOMB.DRIFT_BASE * scale * 1.2
      const min = BOMB.DRIFT_BASE * scale * 0.6
      for (let i = 0; i < 1000; i++) {
        const v = initialVelocity(rng, scale)
        const sp = Math.hypot(v.x, v.y)
        expect(sp, `scale=${scale}`).toBeLessThanOrEqual(max + 1e-9)
        expect(sp, `scale=${scale}`).toBeGreaterThanOrEqual(min - 1e-9)
      }
    }
  })

  it('drift のスピード上限（DRIFT_BASE * scale * 1.6）を超える初速は出ない', () => {
    // 初速が上限を超えていると、出た瞬間に drift がベクトルを丸めて挙動が跳ねる
    const rng = createRng(59)
    for (const t of [0, 60, 180, 600]) {
      const scale = driftScale(t)
      const cap = BOMB.DRIFT_BASE * scale * 1.6
      for (let i = 0; i < 500; i++) {
        const v = initialVelocity(rng, scale)
        expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(cap)
      }
    }
  })

  it('上下左右いずれの向きにも出る（片方向に偏らない）', () => {
    const rng = createRng(61)
    let up = 0
    let down = 0
    let left = 0
    let right = 0
    for (let i = 0; i < 2000; i++) {
      const v = initialVelocity(rng, 1)
      if (v.y < 0) up++
      else down++
      if (v.x < 0) left++
      else right++
    }
    for (const n of [up, down, left, right]) expect(n).toBeGreaterThan(600)
  })

  it('scale が 0 でも NaN にならない', () => {
    const rng = createRng(67)
    const v = initialVelocity(rng, 0)
    expect(Number.isFinite(v.x)).toBe(true)
    expect(Number.isFinite(v.y)).toBe(true)
    expect(Math.hypot(v.x, v.y)).toBe(0)
  })
})
