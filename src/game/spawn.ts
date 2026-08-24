import { BOMB, SPAWN } from '../core/constants'
import { nextFloat, nextRange, nextSign } from '../core/rng'
import type { BombKind, Rect, RngState, Vec2 } from '../core/types'
import { spawnInterval } from './difficulty'

/** ゆらぎを乗せた実スポーン間隔 */
export function nextInterval(t: number, rng: RngState): number {
  const base = spawnInterval(t)
  return base * (1 + (nextFloat(rng) * 2 - 1) * SPAWN.JITTER)
}

/**
 * 次に出す形。基本は 50/50 だが、同じ形が MAX_SAME_KIND_RUN 回続いたら反対を強制する。
 * 難易度上昇に「色の見分けにくさ」は一切使わない。上げるのは同時数・間隔・導火線・速さだけ。
 */
export function pickKind(rng: RngState, lastKind: BombKind | null, run: number): BombKind {
  if (lastKind !== null && run >= SPAWN.MAX_SAME_KIND_RUN) {
    return lastKind === 'round' ? 'square' : 'round'
  }
  return nextFloat(rng) < 0.5 ? 'round' : 'square'
}

/**
 * 既存のボムから十分離れた位置を探す。
 * 見つからなければ最後の候補を返す（分離処理が後で押し広げるので詰みはしない）。
 */
export function findSpawnPos(
  existing: readonly { x: number; y: number }[],
  field: Rect,
  rng: RngState
): Vec2 {
  const r = BOMB.RADIUS
  const minGap = BOMB.RADIUS * BOMB.SPAWN_MIN_GAP
  const minGap2 = minGap * minGap
  // 上寄りに出す。漂って中央〜下部へ降りてくるので親指圏で捌ける
  const yMax = field.y + Math.max(r * 2, field.h * 0.45)
  let last: Vec2 = { x: field.x + field.w / 2, y: field.y + r }

  for (let i = 0; i < BOMB.SPAWN_TRIES; i++) {
    const p = {
      x: nextRange(rng, field.x + r, field.x + field.w - r),
      y: nextRange(rng, field.y + r, yMax),
    }
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

/** 初速。ゆっくり漂わせる */
export function initialVelocity(rng: RngState, scale: number): Vec2 {
  const speed = BOMB.DRIFT_BASE * scale * nextRange(rng, 0.6, 1.2)
  const angle = nextRange(rng, 0, Math.PI * 2)
  return { x: Math.cos(angle) * speed, y: Math.abs(Math.sin(angle) * speed) * nextSign(rng) }
}
