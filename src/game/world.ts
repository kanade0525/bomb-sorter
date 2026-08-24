import { BOMB, SPAWN } from '../core/constants'
import { createRng, nextRange } from '../core/rng'
import type { Bomb, BombKind, Layout, RngState, World } from '../core/types'
import { fuseLength } from './difficulty'
import { findSpawnPos, initialVelocity } from './spawn'

export function createBomb(
  id: number,
  kind: BombKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  fuse: number,
  wobble: number
): Bomb {
  return {
    id,
    kind,
    x,
    y,
    vx,
    vy,
    fuse,
    fuseMax: fuse,
    grabbedBy: null,
    wobble,
    holdDx: 0,
    holdDy: 0,
    vanish: 0,
  }
}

/** タイトル画面で漂わせる飾りのボム。導火線は減らない（phase が playing でないため） */
function decorativeBombs(layout: Layout, rng: RngState): Bomb[] {
  const bombs: Bomb[] = []
  for (let i = 0; i < 3; i++) {
    const p = findSpawnPos(bombs, layout.field, rng)
    const v = initialVelocity(rng, 1)
    const kind: BombKind = i % 2 === 0 ? 'round' : 'square'
    bombs.push(
      createBomb(
        i + 1,
        kind,
        p.x,
        layout.field.y + layout.field.h * (0.2 + i * 0.25),
        v.x,
        v.y,
        9,
        nextRange(rng, 0, Math.PI * 2)
      )
    )
  }
  return bombs
}

export function createWorld(seed: number, layout: Layout): World {
  const rng = createRng(seed)
  const bombs = decorativeBombs(layout, rng)
  return {
    phase: 'title',
    time: 0,
    phaseTime: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    bombs,
    nextId: bombs.length + 1,
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

/** プレイ開始前の初期化。ボムを掃き、スコアとコンボを戻す */
export function resetForPlay(w: World, layout: Layout): void {
  w.time = 0
  w.score = 0
  w.combo = 0
  w.comboTimer = 0
  w.bestCombo = 0
  w.sorted = 0
  w.bombs = []
  w.nextId = 1
  w.spawnTimer = SPAWN.FIRST_DELAY
  w.effects = []
  w.deathReason = null
  w.lastKind = null
  w.sameKindRun = 0
  w.warnLevel = 0

  // 最初の 1 個だけは中央付近に置いて、何をする画面なのかを一目で分かるようにする
  const p = findSpawnPos([], layout.field, w.rng)
  const fuse = fuseLength(0)
  const v = initialVelocity(w.rng, 1)
  const kind: BombKind = w.rng.s % 2 === 0 ? 'round' : 'square'
  w.bombs.push(createBomb(w.nextId++, kind, p.x, p.y, v.x, v.y, fuse, 0))
  w.lastKind = kind
  w.sameKindRun = 1
  void BOMB
}
