import { BOMB, FIELD, FUSE, INPUT, SCORE, TIMING } from '../core/constants'
import { clamp } from '../core/math'
import { nextRange } from '../core/rng'
import type { Bomb, Command, DeathReason, InputAction, Layout, World } from '../core/types'
import { driftScale, fuseLength, maxAlive } from './difficulty'
import { pickBombAt, zoneAt } from './hittest'
import { nextPhase, type PhaseEvent } from './phase'
import { separateBombs } from './separate'
import { findSpawnPos, initialVelocity, nextInterval, pickKind } from './spawn'
import { scoreGain } from './score'
import { createBomb } from './world'
import { resetForPlay } from './world'

/**
 * ゲームの進行。
 *
 * この関数（と game/ 配下）は window / document / Date / Math.random を一切触らない。
 * 「起きたこと」は world.effects に積むだけで、音や描画は呼ばない。
 * effects を空にするのは呼び出し側（main.ts）の責任 — 1 フレームで複数回 step する
 * 場合があるので、ここでクリアしてはいけない。
 */
export function stepWorld(
  w: World,
  dt: number,
  actions: readonly InputAction[],
  layout: Layout
): void {
  w.phaseTime += dt

  switch (w.phase) {
    case 'title':
      drift(w, dt, layout, 1)
      return

    case 'ready':
      drift(w, dt, layout, driftScale(w.time))
      if (w.phaseTime >= TIMING.READY_SEC) transition(w, 'ready-done')
      return

    case 'paused':
      return

    case 'exploding':
      if (w.phaseTime >= TIMING.EXPLODE_SEC) transition(w, 'explode-done')
      return

    case 'gameover':
      return

    case 'playing':
      break
  }

  w.time += dt

  handleInput(w, actions, layout)
  updateCombo(w, dt)
  drift(w, dt, layout, driftScale(w.time))
  updateFuse(w, dt)
  if (w.phase !== 'playing') return
  updateVanish(w, dt)
  trySpawn(w, dt, layout)
  separateBombs(w.bombs, layout.field)
}

/** 外からの指示。フェーズが変わったときだけ副作用（初期化）を行う */
export function applyCommand(w: World, cmd: Command, layout: Layout): void {
  const before = w.phase
  const after = nextPhase(before, cmd)
  if (after === before) return

  w.phase = after
  w.phaseTime = 0

  // ready に「入り直す」のが新規プレイなのか復帰なのかで、初期化するかどうかが変わる
  const isFreshStart = before === 'title' || before === 'gameover' || cmd === 'restart'
  if (after === 'ready' && isFreshStart) resetForPlay(w, layout)
  if (after === 'title') {
    // タイトルへ戻るときは飾りのボムを作り直す
    resetForPlay(w, layout)
  }
}

function transition(w: World, event: PhaseEvent): void {
  const after = nextPhase(w.phase, event)
  if (after === w.phase) return
  w.phase = after
  w.phaseTime = 0
}

function kill(w: World, reason: DeathReason, x: number, y: number): void {
  if (w.phase !== 'playing') return
  w.deathReason = reason
  w.effects.push({ t: 'miss', x, y, reason })
  // 掴んでいた指はすべて離させる
  for (const b of w.bombs) b.grabbedBy = null
  transition(w, 'die')
}

function activeDrags(w: World): number {
  let n = 0
  for (const b of w.bombs) if (b.grabbedBy !== null) n++
  return n
}

function findGrabbed(w: World, pointerId: number): Bomb | null {
  for (const b of w.bombs) if (b.grabbedBy === pointerId) return b
  return null
}

/** ドラッグ中に指を追える範囲。ゾーンには届き、画面外へは出さない */
function dragBounds(layout: Layout): { minX: number; maxX: number; minY: number; maxY: number } {
  const r = BOMB.RADIUS
  const zone = layout.zones[0]
  const bottom = zone ? zone.rect.y + zone.rect.h : layout.logicalH - FIELD.ZONE_BOTTOM_PAD
  return {
    minX: r,
    maxX: layout.logicalW - r,
    minY: layout.field.y,
    maxY: bottom,
  }
}

function handleInput(w: World, actions: readonly InputAction[], layout: Layout): void {
  const b = dragBounds(layout)

  for (const a of actions) {
    switch (a.t) {
      case 'grab': {
        if (activeDrags(w) >= INPUT.MAX_ACTIVE_DRAGS) break
        const bomb = pickBombAt(w.bombs, a.x, a.y)
        if (!bomb) break
        bomb.grabbedBy = a.pointerId
        // 掴んだ瞬間に中心が指へ飛ぶと気持ち悪いので、ズレを保持する
        bomb.holdDx = bomb.x - a.x
        bomb.holdDy = bomb.y - a.y
        bomb.vx = 0
        bomb.vy = 0
        w.effects.push({ t: 'grab' })
        break
      }

      case 'move': {
        const bomb = findGrabbed(w, a.pointerId)
        if (!bomb) break
        bomb.x = clamp(a.x + bomb.holdDx, b.minX, b.maxX)
        bomb.y = clamp(a.y + bomb.holdDy, b.minY, b.maxY)
        break
      }

      case 'release': {
        const bomb = findGrabbed(w, a.pointerId)
        if (!bomb) break
        bomb.x = clamp(a.x + bomb.holdDx, b.minX, b.maxX)
        bomb.y = clamp(a.y + bomb.holdDy, b.minY, b.maxY)
        bomb.grabbedBy = null
        judgeDrop(w, bomb, layout)
        break
      }

      case 'cancel': {
        // 着信や通知でドラッグが途切れただけなので、ゾーン判定はしない
        const bomb = findGrabbed(w, a.pointerId)
        if (!bomb) break
        bomb.grabbedBy = null
        returnToField(bomb, layout)
        break
      }
    }
    if (w.phase !== 'playing') return
  }
}

/** 判定はリリース時のボム中心のみで確定させる。ドラッグ中に境界を掠めても発火しない */
function judgeDrop(w: World, bomb: Bomb, layout: Layout): void {
  const zone = zoneAt(layout, bomb.x, bomb.y)
  if (!zone) {
    returnToField(bomb, layout)
    return
  }

  if (zone.kind !== bomb.kind) {
    kill(w, 'wrong', bomb.x, bomb.y)
    return
  }

  const ratio = bomb.fuseMax > 0 ? clamp(bomb.fuse / bomb.fuseMax, 0, 1) : 0
  const gain = scoreGain(ratio, w.combo)
  w.score += gain
  w.sorted += 1
  w.combo += 1
  if (w.combo > w.bestCombo) w.bestCombo = w.combo
  w.comboTimer = SCORE.COMBO_WINDOW
  bomb.vanish = 0.0001
  bomb.fuse = bomb.fuseMax // 消滅演出中に時間切れさせない
  w.effects.push({ t: 'ok', x: bomb.x, y: bomb.y, kind: bomb.kind, gain, combo: w.combo })
}

function returnToField(bomb: Bomb, layout: Layout): void {
  const r = BOMB.RADIUS
  const f = layout.field
  bomb.x = clamp(bomb.x, f.x + r, f.x + f.w - r)
  bomb.y = clamp(bomb.y, f.y + r, f.y + f.h - r)
  bomb.vx = 0
  bomb.vy = 0
}

function updateCombo(w: World, dt: number): void {
  if (w.combo <= 0) return
  w.comboTimer -= dt
  if (w.comboTimer <= 0) {
    w.combo = 0
    w.comboTimer = 0
    w.effects.push({ t: 'combo-lost' })
  }
}

/** フィールド内を漂わせる。落下させないのは「触ってないのに誤爆死」を防ぐため */
function drift(w: World, dt: number, layout: Layout, scale: number): void {
  const r = BOMB.RADIUS
  const f = layout.field
  const maxSpeed = BOMB.DRIFT_BASE * scale * 1.6

  for (const b of w.bombs) {
    b.wobble += dt * BOMB.WOBBLE_HZ * Math.PI * 2
    if (b.grabbedBy !== null || b.vanish > 0) continue

    b.x += b.vx * dt
    b.y += b.vy * dt

    if (b.x < f.x + r) {
      b.x = f.x + r
      b.vx = Math.abs(b.vx)
    } else if (b.x > f.x + f.w - r) {
      b.x = f.x + f.w - r
      b.vx = -Math.abs(b.vx)
    }
    if (b.y < f.y + r) {
      b.y = f.y + r
      b.vy = Math.abs(b.vy)
    } else if (b.y > f.y + f.h - r) {
      b.y = f.y + f.h - r
      b.vy = -Math.abs(b.vy)
    }

    const sp = Math.hypot(b.vx, b.vy)
    if (sp > maxSpeed && sp > 0) {
      b.vx = (b.vx / sp) * maxSpeed
      b.vy = (b.vy / sp) * maxSpeed
    }
  }
}

function updateFuse(w: World, dt: number): void {
  let level: 0 | 1 | 2 = 0

  for (const b of w.bombs) {
    if (b.vanish > 0) continue
    b.fuse -= dt
    if (b.fuse <= 0) {
      b.fuse = 0
      kill(w, 'fuse', b.x, b.y)
      return
    }
    const ratio = b.fuseMax > 0 ? b.fuse / b.fuseMax : 1
    if (ratio < FUSE.CRITICAL_RATIO) level = 2
    else if (ratio < FUSE.WARN_RATIO && level < 1) level = 1
  }

  // 警告レベルが上がった瞬間だけ音を鳴らす。毎フレーム鳴らすと騒音になる
  if (level > w.warnLevel) w.effects.push({ t: 'warn', level: level as 1 | 2 })
  w.warnLevel = level
}

function updateVanish(w: World, dt: number): void {
  let alive = 0
  for (const b of w.bombs) {
    if (b.vanish > 0) {
      b.vanish += BOMB.VANISH_SPEED * dt
    }
    if (b.vanish < 1) alive++
  }
  if (alive !== w.bombs.length) {
    w.bombs = w.bombs.filter((b) => b.vanish < 1)
  }
}

function trySpawn(w: World, dt: number, layout: Layout): void {
  const living = w.bombs.filter((b) => b.vanish === 0)
  const cap = maxAlive(w.time)

  // 上限に達している間はタイマーを進めない。溜まりすぎた状態から立て直す猶予を作る
  if (living.length >= cap) return

  w.spawnTimer -= dt
  if (w.spawnTimer > 0) return

  const kind = pickKind(w.rng, w.lastKind, w.sameKindRun)
  w.sameKindRun = kind === w.lastKind ? w.sameKindRun + 1 : 1
  w.lastKind = kind

  const p = findSpawnPos(living, layout.field, w.rng)
  const v = initialVelocity(w.rng, driftScale(w.time))
  const fuse = fuseLength(w.time)
  const wob = nextRange(w.rng, 0, Math.PI * 2)
  w.bombs.push(createBomb(w.nextId++, kind, p.x, p.y, v.x, v.y, fuse, wob))
  w.effects.push({ t: 'spawn', x: p.x, y: p.y })
  w.spawnTimer = nextInterval(w.time, w.rng)
}
