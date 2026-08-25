import { describe, expect, it } from 'vitest'
import { INPUT, SCORE, SPAWN, TIMING } from '../core/constants'
import type { Bomb, InputAction, Layout, World } from '../core/types'
import { computeLayout } from '../view/layout'
import { maxAlive } from './difficulty'
import { applyCommand, stepWorld } from './step'
import { createWorld } from './world'

const LAYOUT = computeLayout(760, 360)

/** playing に入った状態の世界を作る */
function started(seed = 1): World {
  const w = createWorld(seed, LAYOUT)
  applyCommand(w, 'start', LAYOUT)
  stepWorld(w, TIMING.READY_SEC + 0.001, [], LAYOUT)
  expect(w.phase).toBe('playing')
  return w
}

function zoneCenter(layout: Layout, kind: Bomb['kind']) {
  const z = layout.zones.find((x) => x.kind === kind)
  if (!z) throw new Error('ゾーンが見つからない')
  return { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 }
}

/** ボムを掴んで指定した種類のゾーンへ運んで離す */
function dragTo(w: World, bomb: Bomb, kind: Bomb['kind'], pointerId = 1): void {
  const to = zoneCenter(LAYOUT, kind)
  const acts: InputAction[] = [{ t: 'grab', pointerId, x: bomb.x, y: bomb.y }]
  stepWorld(w, 1 / 60, acts, LAYOUT)
  stepWorld(w, 1 / 60, [{ t: 'move', pointerId, x: to.x, y: to.y }], LAYOUT)
  stepWorld(w, 1 / 60, [{ t: 'release', pointerId, x: to.x, y: to.y }], LAYOUT)
}

function firstBomb(w: World): Bomb {
  const b = w.bombs.find((x) => x.vanish === 0)
  if (!b) throw new Error('ボムがない')
  return b
}

describe('仕分けの判定', () => {
  it('正しいゾーンへ入れるとスコアが増える', () => {
    const w = started()
    const b = firstBomb(w)
    dragTo(w, b, b.kind)
    expect(w.phase).toBe('playing')
    expect(w.score).toBeGreaterThan(0)
    expect(w.sorted).toBe(1)
    expect(w.combo).toBe(1)
    expect(w.effects.some((e) => e.t === 'ok')).toBe(true)
  })

  it('誤ったゾーンへ入れると即座に爆発する', () => {
    const w = started()
    const b = firstBomb(w)
    const wrong = b.kind === 'red' ? 'black' : 'red'
    dragTo(w, b, wrong)
    expect(w.phase).toBe('exploding')
    expect(w.deathReason).toBe('wrong')
    expect(w.score).toBe(0)
    expect(w.effects.some((e) => e.t === 'miss')).toBe(true)
  })

  it('爆発演出が終わるとゲームオーバーになる', () => {
    const w = started()
    const b = firstBomb(w)
    dragTo(w, b, b.kind === 'red' ? 'black' : 'red')
    stepWorld(w, TIMING.EXPLODE_SEC + 0.01, [], LAYOUT)
    expect(w.phase).toBe('gameover')
  })

  it('ドラッグ中に誤ったゾーンを通過しても、戻して離せば死なない', () => {
    const w = started()
    const b = firstBomb(w)
    const wrong = zoneCenter(LAYOUT, b.kind === 'red' ? 'black' : 'red')
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: wrong.x, y: wrong.y }], LAYOUT)
    const back = { x: LAYOUT.field.x + LAYOUT.field.w / 2, y: LAYOUT.field.y + 40 }
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: back.x, y: back.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: back.x, y: back.y }], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
  })

  it('ゾーンの外で離してもスコアは動かず死なない', () => {
    const w = started()
    const b = firstBomb(w)
    const mid = { x: LAYOUT.field.x + 40, y: LAYOUT.field.y + 40 }
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: mid.x, y: mid.y }], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
    expect(w.bombs.length).toBeGreaterThan(0)
  })

  it('着信などでドラッグが途切れてもミスにならない', () => {
    const w = started()
    const b = firstBomb(w)
    const wrong = zoneCenter(LAYOUT, b.kind === 'red' ? 'black' : 'red')
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: wrong.x, y: wrong.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'cancel', pointerId: 1 }], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(firstBomb(w).grabbedBy).toBeNull()
  })
})

describe('導火線', () => {
  it('尽きると爆発する', () => {
    const w = started()
    for (let i = 0; i < 60 * 30 && w.phase === 'playing'; i++) {
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    expect(w.phase).toBe('exploding')
    expect(w.deathReason).toBe('fuse')
  })

  it('掴んでいる間も減る（持ち続けても逃げられない）', () => {
    const w = started()
    const b = firstBomb(w)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    const before = firstBomb(w).fuse
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(firstBomb(w).fuse).toBeLessThan(before - 0.9)
  })

  it('正解ゾーンへ入れた瞬間に時間切れしなくなる', () => {
    const w = started()
    const b = firstBomb(w)
    const to = zoneCenter(LAYOUT, b.kind)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: to.x, y: to.y }], LAYOUT)
    // 離す直前に残量をほぼゼロにする。消滅演出の途中で時間切れ爆発しないことを見る
    b.fuse = 0.001
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: to.x, y: to.y }], LAYOUT)
    expect(w.phase).toBe('playing')
    for (let i = 0; i < 30; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(w.score).toBeGreaterThan(0)
  })

  it('残量が減ると警告のエフェクトが出る', () => {
    const w = started()
    const b = firstBomb(w)
    b.fuse = b.fuseMax * 0.3
    stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.effects.some((e) => e.t === 'warn' && e.level === 1)).toBe(true)
  })
})

describe('コンボ', () => {
  it('連続で成功すると倍率が上がって得点が伸びる', () => {
    const w = started()
    const gains: number[] = []
    for (let n = 0; n < 4; n++) {
      const b = firstBomb(w)
      b.fuse = b.fuseMax // 導火線ボーナスを揃えて倍率だけを見る
      const before = w.score
      dragTo(w, b, b.kind)
      expect(w.phase).toBe('playing')
      gains.push(w.score - before)
      // 次のボムをすぐ出させる。待っている間にコンボ窓が溶けると倍率の比較にならない
      w.spawnTimer = 0
      for (let i = 0; i < 120 && w.bombs.filter((x) => x.vanish === 0).length === 0; i++) {
        stepWorld(w, 1 / 60, [], LAYOUT)
      }
    }
    expect(w.combo).toBe(4)
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]!).toBeGreaterThan(gains[i - 1]!)
    }
  })

  it('コンボ窓を過ぎると倍率が切れるが死なない', () => {
    const w = started()
    const b = firstBomb(w)
    dragTo(w, b, b.kind)
    expect(w.combo).toBe(1)
    w.effects.length = 0
    // 窓を超えるまで待つ。導火線で死なないよう毎フレーム補充を止める
    for (let i = 0; i < 60 * (SCORE.COMBO_WINDOW + 0.2); i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    expect(w.phase).toBe('playing')
    expect(w.combo).toBe(0)
    expect(w.effects.some((e) => e.t === 'combo-lost')).toBe(true)
  })

  it('最高コンボが記録される', () => {
    const w = started()
    const b = firstBomb(w)
    dragTo(w, b, b.kind)
    expect(w.bestCombo).toBe(1)
    for (let i = 0; i < 60 * 4; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    expect(w.combo).toBe(0)
    expect(w.bestCombo).toBe(1)
  })
})

describe('スポーン', () => {
  it('同時存在の上限を超えない', () => {
    const w = started()
    for (let i = 0; i < 60 * 8; i++) {
      // 導火線で死なせずにスポーンだけを見る
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], LAYOUT)
      const living = w.bombs.filter((b) => b.vanish === 0).length
      expect(living).toBeLessThanOrEqual(maxAlive(w.time))
    }
  })

  it('同じ形が 4 回以上続かない', () => {
    const w = started()
    const kinds: string[] = []
    let last = w.bombs.length
    for (let i = 0; i < 60 * 120 && kinds.length < 40; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      const b = w.bombs.find((x) => x.vanish === 0)
      if (b && w.bombs.filter((x) => x.vanish === 0).length >= maxAlive(w.time)) {
        dragTo(w, b, b.kind)
      }
      stepWorld(w, 1 / 60, [], LAYOUT)
      if (w.bombs.length > last) {
        const nb = w.bombs[w.bombs.length - 1]
        if (nb) kinds.push(nb.kind)
      }
      last = w.bombs.length
    }
    let run = 1
    for (let i = 1; i < kinds.length; i++) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1
      expect(run).toBeLessThanOrEqual(3)
    }
  })
})

describe('同時ドラッグ', () => {
  it('上限までは同時に掴める', () => {
    const w = started()
    // ボムが 2 個以上出るまで進める
    for (let i = 0; i < 60 * 10 && w.bombs.filter((b) => b.vanish === 0).length < 3; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    const bombs = w.bombs.filter((b) => b.vanish === 0)
    expect(bombs.length).toBeGreaterThanOrEqual(3)

    const acts: InputAction[] = bombs
      .slice(0, 3)
      .map((b, i) => ({ t: 'grab' as const, pointerId: i + 1, x: b.x, y: b.y }))
    stepWorld(w, 1 / 60, acts, LAYOUT)
    const grabbed = w.bombs.filter((b) => b.grabbedBy !== null).length
    expect(grabbed).toBe(INPUT.MAX_ACTIVE_DRAGS)
  })

  it('同じボムを 2 本の指で掴めない', () => {
    const w = started()
    const b = firstBomb(w)
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'grab', pointerId: 1, x: b.x, y: b.y },
        { t: 'grab', pointerId: 2, x: b.x, y: b.y },
      ],
      LAYOUT
    )
    expect(w.bombs.filter((x) => x.grabbedBy === 1).length).toBe(1)
    expect(w.bombs.filter((x) => x.grabbedBy === 2).length).toBe(0)
  })
})

describe('決定性', () => {
  it('同じシードと同じ入力からは同じ結果になる', () => {
    const run = () => {
      const w = started(4242)
      for (let i = 0; i < 60 * 8; i++) {
        const b = w.bombs.find((x) => x.vanish === 0 && x.fuse < 3)
        if (b) dragTo(w, b, b.kind)
        stepWorld(w, 1 / 60, [], LAYOUT)
      }
      return {
        score: w.score,
        phase: w.phase,
        combo: w.combo,
        sorted: w.sorted,
        bombs: w.bombs.map((b) => ({ k: b.kind, x: Math.round(b.x), y: Math.round(b.y) })),
      }
    }
    expect(run()).toEqual(run())
  })

  it('シードが違えば別の展開になる', () => {
    const kindsOf = (seed: number) => {
      const w = started(seed)
      for (let i = 0; i < 60 * 8; i++) {
        for (const x of w.bombs) x.fuse = x.fuseMax
        stepWorld(w, 1 / 60, [], LAYOUT)
      }
      return w.bombs.map((b) => `${b.kind}:${Math.round(b.x)}`).join(',')
    }
    expect(kindsOf(1)).not.toBe(kindsOf(98765))
  })
})

describe('フェーズ操作', () => {
  it('ポーズ中は時間が進まない', () => {
    const w = started()
    applyCommand(w, 'pause', LAYOUT)
    const t = w.time
    const fuse = firstBomb(w).fuse
    for (let i = 0; i < 60 * 5; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.time).toBe(t)
    expect(firstBomb(w).fuse).toBe(fuse)
  })

  it('復帰は ready を経由し、その間は導火線が減らない', () => {
    const w = started()
    applyCommand(w, 'pause', LAYOUT)
    applyCommand(w, 'resume', LAYOUT)
    expect(w.phase).toBe('ready')
    const fuse = firstBomb(w).fuse
    stepWorld(w, TIMING.READY_SEC * 0.5, [], LAYOUT)
    expect(firstBomb(w).fuse).toBe(fuse)
    stepWorld(w, TIMING.READY_SEC, [], LAYOUT)
    expect(w.phase).toBe('playing')
  })

  it('リトライでスコアとボムが初期化される', () => {
    const w = started()
    const b = firstBomb(w)
    dragTo(w, b, b.kind)
    expect(w.score).toBeGreaterThan(0)
    w.spawnTimer = 0
    for (let i = 0; i < 120 && w.bombs.filter((x) => x.vanish === 0).length === 0; i++) {
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    const next = firstBomb(w)
    dragTo(w, next, next.kind === 'red' ? 'black' : 'red')
    stepWorld(w, TIMING.EXPLODE_SEC + 0.01, [], LAYOUT)
    expect(w.phase).toBe('gameover')

    applyCommand(w, 'restart', LAYOUT)
    expect(w.phase).toBe('ready')
    expect(w.score).toBe(0)
    expect(w.combo).toBe(0)
    expect(w.time).toBe(0)
    expect(w.deathReason).toBeNull()
    expect(w.bombs.length).toBe(SPAWN.BURST_AT_START)
  })

  it('タイトル画面では導火線が減らない', () => {
    const w = createWorld(1, LAYOUT)
    const fuses = w.bombs.map((b) => b.fuse)
    for (let i = 0; i < 60 * 20; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.phase).toBe('title')
    expect(w.bombs.map((b) => b.fuse)).toEqual(fuses)
  })
})

describe('フィールドの境界', () => {
  it('ボムはフィールドから出ない', () => {
    const w = started()
    for (let i = 0; i < 60 * 20; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], LAYOUT)
      for (const b of w.bombs) {
        if (b.grabbedBy !== null || b.vanish > 0) continue
        expect(b.x).toBeGreaterThanOrEqual(LAYOUT.field.x - 0.001)
        expect(b.x).toBeLessThanOrEqual(LAYOUT.field.x + LAYOUT.field.w + 0.001)
        expect(b.y).toBeGreaterThanOrEqual(LAYOUT.field.y - 0.001)
        expect(b.y).toBeLessThanOrEqual(LAYOUT.field.y + LAYOUT.field.h + 0.001)
      }
    }
  })

  it('ドラッグ中も画面の外へは出せない', () => {
    const w = started()
    const b = firstBomb(w)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: -9999, y: -9999 }], LAYOUT)
    const g = w.bombs.find((x) => x.grabbedBy === 1)!
    expect(g.x).toBeGreaterThan(0)
    expect(g.y).toBeGreaterThan(0)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: 9999, y: 9999 }], LAYOUT)
    expect(g.x).toBeLessThan(LAYOUT.logicalW)
    expect(g.y).toBeLessThan(LAYOUT.logicalH)
  })
})
