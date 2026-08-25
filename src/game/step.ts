import { BOMB, FUSE, INPUT, SCORE, TIMING } from '../core/constants'
import { clamp } from '../core/math'
import type { Bomb, Command, DeathReason, InputAction, Layout, World } from '../core/types'
import { maxAlive, walkScale } from './difficulty'
import { addStored, stepStored } from './store'
import { walkBombs } from './walk'
import { pickBombAt, zoneAt } from './hittest'
import { nextPhase, type PhaseEvent } from './phase'
import { separateBombs } from './separate'
import { nextInterval } from './spawn'
import { scoreGain } from './score'
import { chooseKind, resetForPlay, resetForTitle, spawnBomb } from './world'

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
      walkBombs(w.bombs, dt, layout.field, 1, w.rng)
      stepStored(w.stored.red, dt)
      stepStored(w.stored.black, dt)
      return

    case 'ready':
      walkBombs(w.bombs, dt, layout.field, walkScale(w.time), w.rng)
      stepStored(w.stored.red, dt)
      stepStored(w.stored.black, dt)
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
  // 誤投入で死んだらここで抜ける。続けて drift を走らせると、ゾーンの中にある
  // ボムがフィールド内へ clamp されて、爆発を出した座標と実際の位置が食い違う。
  // コンボ切れや警告音が爆発と同時に鳴るのも防げる
  if (w.phase !== 'playing') return

  updateCombo(w, dt)
  walkBombs(w.bombs, dt, layout.field, walkScale(w.time), w.rng)
  stepStored(w.stored.red, dt)
  stepStored(w.stored.black, dt)
  updateFuse(w, dt)
  if (w.phase !== 'playing') return
  updateVanish(w, dt)
  trySpawn(w, dt, layout)
  // 分離は時間に依存しない位置の押し合いなので、dt = 0 でも動いてしまう。
  // 同時に出す数を増やしたら重なった状態で始まることが増えて表面化した。
  // 「時間が進まないなら何も起きない」を保つため、進んだときだけ押し合わせる
  if (dt > 0) separateBombs(w.bombs, layout.field)
}

/**
 * 進行中のドラッグをすべて手放す。ゾーン判定はしない。
 *
 * レイアウトが変わると、掴んでいるボムの論理座標はそのままなのに、指の論理座標は
 * 新しい座標系で読み直される。iOS でツールバーが出て高さが 100px 縮んだ瞬間、
 * 指を一切動かしていないのに「ボムがゾーンの中にある」状態になり、離すだけで
 * 誤爆死した（6/6 再現）。座標系が変わったら判定の前提が崩れているので、
 * 通知でドラッグが途切れたときと同じ扱い（ミスにしない）へ落とす。
 */
export function releaseAllDrags(w: World, layout: Layout): void {
  for (const b of w.bombs) {
    if (b.grabbedBy === null) continue
    b.grabbedBy = null
    returnToField(b, layout)
  }
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
  if (after === 'title') resetForTitle(w, layout)
}

function transition(w: World, event: PhaseEvent): void {
  const after = nextPhase(w.phase, event)
  if (after === w.phase) return
  w.phase = after
  w.phaseTime = 0
}

function kill(w: World, reason: DeathReason, bomb: Bomb): void {
  if (w.phase !== 'playing') return
  w.deathReason = reason
  // 演出側が座標からボムを探し直さなくて済むよう、形もここで渡しておく。
  // 座標の突き合わせは浮動小数の一致に頼ることになり、必ず取りこぼす
  w.effects.push({ t: 'miss', x: bomb.x, y: bomb.y, kind: bomb.kind, reason })
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

/**
 * ドラッグ中に指を追える範囲。箱には届き、画面外へは出さない。
 *
 * containsPoint は右端と下端を含まない（x < rect.x + rect.w）ので、端ちょうどへ
 * clamp すると「箱の外」になる。端の外側で離した指がすべてその 1 点に写るため、
 * 一度それが「入れたのに無反応」の死角を作った。必ず内側 1px に収める。
 */
function dragBounds(layout: Layout): { minX: number; maxX: number; minY: number; maxY: number } {
  const zones = layout.zones
  const first = zones[0]
  const last = zones[zones.length - 1]
  const leftEdge = first ? first.rect.x : 0
  const rightEdge = last ? last.rect.x + last.rect.w : layout.logicalW
  const top = first ? first.rect.y : layout.field.y
  const bottom = first ? first.rect.y + first.rect.h : layout.logicalH
  return {
    minX: leftEdge,
    maxX: rightEdge - 1,
    minY: Math.min(top, layout.field.y),
    maxY: bottom - 1,
  }
}

function handleInput(w: World, actions: readonly InputAction[], layout: Layout): void {
  const b = dragBounds(layout)

  for (const a of actions) {
    switch (a.t) {
      case 'grab': {
        // マウスは左ボタンを押したまま右ボタンを押すと、同じ pointerId で
        // pointerdown がもう一度飛んでくる。2 個目を掴ませると release が
        // 掴んでいない側に適用され、触ってもいないボムが誤爆する
        if (findGrabbed(w, a.pointerId)) break
        if (activeDrags(w) >= INPUT.MAX_ACTIVE_DRAGS) break
        const bomb = pickBombAt(w.bombs, a.x, a.y)
        if (!bomb) break
        bomb.grabbedBy = a.pointerId
        // 掴んだ瞬間に中心が指へ飛ぶと気持ち悪いので、ズレを保持する
        bomb.holdDx = bomb.x - a.x
        bomb.holdDy = bomb.y - a.y
        bomb.speed = 0
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
    kill(w, 'wrong', bomb)
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
  // 仕分けた結果を箱の中に残す。数字だけでなく目で成果が分かるようにする
  addStored(w.stored[zone.kind], bomb.kind, w.rng)
  w.effects.push({ t: 'ok', x: bomb.x, y: bomb.y, kind: bomb.kind, gain, combo: w.combo })
}

function returnToField(bomb: Bomb, layout: Layout): void {
  const r = BOMB.RADIUS
  const f = layout.field
  bomb.x = clamp(bomb.x, f.x + r, f.x + f.w - r)
  bomb.y = clamp(bomb.y, f.y + r, f.y + f.h - r)
  bomb.speed = 0
  bomb.turnTimer = 0
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

function updateFuse(w: World, dt: number): void {
  let level: 0 | 1 | 2 = 0

  for (const b of w.bombs) {
    if (b.vanish > 0) continue
    b.fuse -= dt
    if (b.fuse <= 0) {
      b.fuse = 0
      kill(w, 'fuse', b)
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

  const bomb = spawnBomb(w, layout, chooseKind(w), w.time)
  w.effects.push({ t: 'spawn', x: bomb.x, y: bomb.y })
  w.spawnTimer = nextInterval(w.time, w.rng)
}
