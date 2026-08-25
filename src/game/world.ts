import { SPAWN } from '../core/constants'
import { createRng, nextFloat, nextRange } from '../core/rng'
import type { Bomb, BombKind, Layout, RngState, World } from '../core/types'
import { fuseLength } from './difficulty'
import { findSpawnPos, initialDirection, pickKind } from './spawn'

export function createBomb(
  id: number,
  kind: BombKind,
  x: number,
  y: number,
  dir: number,
  speed: number,
  fuse: number,
  step: number
): Bomb {
  return {
    id,
    kind,
    x,
    y,
    dir,
    speed,
    turnTimer: 0,
    fuse,
    fuseMax: fuse,
    grabbedBy: null,
    step,
    facing: Math.cos(dir) < 0 ? -1 : 1,
    holdDx: 0,
    holdDy: 0,
    vanish: 0,
  }
}

/** フィールドの縁から 1 体、歩き出させる */
function spawnBomb(w: World, layout: Layout, kind: BombKind, t: number): Bomb {
  const living = w.bombs.filter((b) => b.vanish === 0)
  const p = findSpawnPos(living, layout.field, w.rng)
  const dir = initialDirection(p, layout.field, w.rng)
  const bomb = createBomb(
    w.nextId++,
    kind,
    p.x,
    p.y,
    dir,
    0,
    fuseLength(t),
    nextRange(w.rng, 0, Math.PI * 2)
  )
  w.bombs.push(bomb)
  return bomb
}

/** 次に出す色を決めて、履歴を進める */
export function chooseKind(w: World): BombKind {
  const kind = pickKind(w.rng, w.lastKind, w.sameKindRun)
  w.sameKindRun = kind === w.lastKind ? w.sameKindRun + 1 : 1
  w.lastKind = kind
  return kind
}

/** タイトル画面で歩かせる飾りのボム */
function decorativeBombs(w: World, layout: Layout): void {
  for (let i = 0; i < 4; i++) {
    spawnBomb(w, layout, i % 2 === 0 ? 'red' : 'black', 0)
  }
}

function emptyWorld(rng: RngState): World {
  return {
    phase: 'title',
    time: 0,
    phaseTime: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    bombs: [],
    stored: { red: [], black: [] },
    nextId: 1,
    spawnTimer: SPAWN.FIRST_DELAY,
    rng,
    effects: [],
    deathReason: null,
    lastKind: null,
    sameKindRun: 0,
    warnLevel: 0,
    sorted: 0,
  }
}

export function createWorld(seed: number, layout: Layout): World {
  const w = emptyWorld(createRng(seed))
  decorativeBombs(w, layout)
  return w
}

/**
 * プレイ開始前の初期化。
 *
 * 最初から複数体を四方から出す。1 個ずつ運ぶだけの時間が続くと、
 * 序盤がただの待ち時間になって退屈になる。
 */
export function resetForPlay(w: World, layout: Layout): void {
  w.time = 0
  w.score = 0
  w.combo = 0
  w.comboTimer = 0
  w.bestCombo = 0
  w.sorted = 0
  w.bombs = []
  w.stored = { red: [], black: [] }
  w.nextId = 1
  w.spawnTimer = SPAWN.FIRST_DELAY
  w.effects = []
  w.deathReason = null
  w.lastKind = null
  w.sameKindRun = 0
  w.warnLevel = 0

  for (let i = 0; i < SPAWN.BURST_AT_START; i++) {
    // 1 体目の色だけは乱数から引く（rng.s の偶奇は乱数ではないので使わない）
    const kind = i === 0 ? (nextFloat(w.rng) < 0.5 ? 'red' : 'black') : chooseKind(w)
    const bomb = spawnBomb(w, layout, kind, 0)
    if (i === 0) {
      w.lastKind = kind
      w.sameKindRun = 1
    }
    // 同時に出したぶん、導火線が一斉に尽きないよう少しずらす。
    // ずらし幅を大きくすると、最後の 1 体が出た瞬間から警告状態になって理不尽になる
    bomb.fuse = bomb.fuseMax * (1 - i * 0.04)
  }
}

/** タイトルへ戻ったときの初期化。飾りのボムを置き直す */
export function resetForTitle(w: World, layout: Layout): void {
  resetForPlay(w, layout)
  w.bombs = []
  w.nextId = 1
  decorativeBombs(w, layout)
  w.lastKind = null
  w.sameKindRun = 0
}

export { spawnBomb }
