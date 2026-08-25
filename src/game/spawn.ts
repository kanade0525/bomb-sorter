import { BOMB, SPAWN } from '../core/constants'
import { nextFloat, nextRange } from '../core/rng'
import type { BombKind, Rect, RngState, Vec2 } from '../core/types'
import { spawnInterval } from './difficulty'

/** ゆらぎを乗せた実スポーン間隔 */
export function nextInterval(t: number, rng: RngState): number {
  const base = spawnInterval(t)
  return base * (1 + (nextFloat(rng) * 2 - 1) * SPAWN.JITTER)
}

/**
 * 次に出す色。基本は 50/50 だが、同じ色が MAX_SAME_KIND_RUN 回続いたら反対を強制する。
 * 難易度上昇に「色の見分けにくさ」は一切使わない。上げるのは同時数・間隔・導火線・速さだけ。
 */
export function pickKind(rng: RngState, lastKind: BombKind | null, run: number): BombKind {
  if (lastKind !== null && run >= SPAWN.MAX_SAME_KIND_RUN) {
    return lastKind === 'red' ? 'black' : 'red'
  }
  return nextFloat(rng) < 0.5 ? 'red' : 'black'
}

/**
 * フィールドの縁のどこかから出す。
 *
 * 決まった場所から 1 個ずつ出てくると、序盤が「出てくるのを待って運ぶ」だけの
 * 単純作業になる。四方から現れるようにして、最初から視線を動かす必要を作る。
 */
export function findSpawnPos(
  existing: readonly { x: number; y: number }[],
  field: Rect,
  rng: RngState
): Vec2 {
  const r = BOMB.RADIUS
  const minGap = BOMB.RADIUS * BOMB.SPAWN_MIN_GAP
  const minGap2 = minGap * minGap

  const minX = field.x + r
  const maxX = field.x + field.w - r
  const minY = field.y + r
  const maxY = field.y + field.h - r

  const onEdge = (): Vec2 => {
    // 上下左右のどれか。フィールドが横長なので上下をやや厚めに選ぶ
    const side = Math.floor(nextFloat(rng) * 4)
    switch (side) {
      case 0:
        return { x: nextRange(rng, minX, maxX), y: minY }
      case 1:
        return { x: nextRange(rng, minX, maxX), y: maxY }
      case 2:
        return { x: minX, y: nextRange(rng, minY, maxY) }
      default:
        return { x: maxX, y: nextRange(rng, minY, maxY) }
    }
  }

  let last = onEdge()
  for (let i = 0; i < BOMB.SPAWN_TRIES; i++) {
    const p = onEdge()
    last = p
    let ok = true
    for (const e of existing) {
      const dx = e.x - p.x
      const dy = e.y - p.y
      if (dx * dx + dy * dy < minGap2) {
        ok = false
        break
      }
    }
    if (ok) return p
  }
  return last
}

/** 出てきた位置からフィールドの内側へ向かって歩き出す向き */
export function initialDirection(pos: Vec2, field: Rect, rng: RngState): number {
  const cx = field.x + field.w / 2
  const cy = field.y + field.h / 2
  const toCenter = Math.atan2(cy - pos.y, cx - pos.x)
  // まっすぐ中心へ向かうと動きが読めてしまうので、少しばらけさせる
  return toCenter + nextRange(rng, -0.8, 0.8)
}
