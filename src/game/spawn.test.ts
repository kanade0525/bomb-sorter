import { describe, expect, it } from 'vitest'
import { BOMB, SPAWN } from '../core/constants'
import { createRng } from '../core/rng'
import type { Rect, RngState } from '../core/types'
import { computeLayout } from '../view/layout'
import { spawnInterval } from './difficulty'
import { findSpawnPos, initialDirection, nextInterval, pickKind } from './spawn'

const FIELD: Rect = computeLayout(760, 360).field
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
      for (let i = 0; i < 200; i++) seen.add(pickKind(rng, 'red', run))
      expect(seen.size, `run=${run} で片方に固定されている`).toBe(2)
    }
  })

  it('run が上限に達すると必ず反対の形を返す', () => {
    const rng = createRng(99)
    for (let i = 0; i < 200; i++) {
      expect(pickKind(rng, 'red', SPAWN.MAX_SAME_KIND_RUN)).toBe('black')
      expect(pickKind(rng, 'black', SPAWN.MAX_SAME_KIND_RUN)).toBe('red')
    }
  })

  it('境界（run = 2 / 3 / 4）の挙動が MAX_SAME_KIND_RUN と一致する', () => {
    expect(SPAWN.MAX_SAME_KIND_RUN).toBe(3)
    const forced = (run: number) => {
      const rng = createRng(1234)
      const out = new Set<string>()
      for (let i = 0; i < 300; i++) out.add(pickKind(rng, 'red', run))
      return out.size === 1 && out.has('black')
    }
    expect(forced(2)).toBe(false)
    expect(forced(3)).toBe(true)
    expect(forced(4)).toBe(true)
  })

  it('強制時は乱数を消費しない（決定性の担保）', () => {
    // 強制されるかどうかで rng の進み方が変わると、同じシードから同じ展開が出なくなる
    const rng: RngState = createRng(555)
    const before = rng.s
    pickKind(rng, 'red', SPAWN.MAX_SAME_KIND_RUN)
    expect(rng.s).toBe(before)
  })

  it('run が上限未満のときはおおよそ 50/50 に散る', () => {
    const rng = createRng(2468)
    let round = 0
    const n = 4000
    for (let i = 0; i < n; i++) if (pickKind(rng, null, 0) === 'red') round++
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

  it('フィールドの縁から出る（四方から現れて序盤を単調にしない）', () => {
    const rng: RngState = createRng(4242)
    for (let i = 0; i < 600; i++) {
      const p = findSpawnPos([], FIELD, rng)
      const onLeft = Math.abs(p.x - (FIELD.x + R)) < 1e-6
      const onRight = Math.abs(p.x - (FIELD.x + FIELD.w - R)) < 1e-6
      const onTop = Math.abs(p.y - (FIELD.y + R)) < 1e-6
      const onBottom = Math.abs(p.y - (FIELD.y + FIELD.h - R)) < 1e-6
      expect(onLeft || onRight || onTop || onBottom, `${p.x},${p.y}`).toBe(true)
    }
  })

  it('四方すべてから出る（偏っていない）', () => {
    const rng: RngState = createRng(777)
    const sides = { left: 0, right: 0, top: 0, bottom: 0 }
    for (let i = 0; i < 800; i++) {
      const p = findSpawnPos([], FIELD, rng)
      if (Math.abs(p.x - (FIELD.x + R)) < 1e-6) sides.left++
      else if (Math.abs(p.x - (FIELD.x + FIELD.w - R)) < 1e-6) sides.right++
      else if (Math.abs(p.y - (FIELD.y + R)) < 1e-6) sides.top++
      else sides.bottom++
    }
    for (const [name, n] of Object.entries(sides)) {
      expect(n, `${name} から 1 度も出ていない`).toBeGreaterThan(50)
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
    const l = computeLayout(960, 360, { top: 59, right: 0, bottom: 34, left: 0 })
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

describe('initialDirection', () => {
  it('フィールドの内側へ向かって歩き出す', () => {
    const rng: RngState = createRng(31)
    const cx = FIELD.x + FIELD.w / 2
    const cy = FIELD.y + FIELD.h / 2
    for (let i = 0; i < 400; i++) {
      const p = findSpawnPos([], FIELD, rng)
      const dir = initialDirection(p, FIELD, rng)
      // 中心へ向かうベクトルと、歩き出す向きの内積が正であること
      const dot = Math.cos(dir) * (cx - p.x) + Math.sin(dir) * (cy - p.y)
      expect(dot, `${p.x},${p.y}`).toBeGreaterThan(0)
    }
  })

  it('毎回まっすぐ中心へは向かわない（動きが読めてしまわない）', () => {
    const rng: RngState = createRng(99)
    const cx = FIELD.x + FIELD.w / 2
    const cy = FIELD.y + FIELD.h / 2
    let varied = 0
    for (let i = 0; i < 200; i++) {
      const p = findSpawnPos([], FIELD, rng)
      const dir = initialDirection(p, FIELD, rng)
      const straight = Math.atan2(cy - p.y, cx - p.x)
      if (Math.abs(dir - straight) > 0.05) varied++
    }
    expect(varied).toBeGreaterThan(180)
  })

  it('有限の値を返す', () => {
    const rng: RngState = createRng(5)
    for (let i = 0; i < 100; i++) {
      const p = findSpawnPos([], FIELD, rng)
      expect(Number.isFinite(initialDirection(p, FIELD, rng))).toBe(true)
    }
  })
})
