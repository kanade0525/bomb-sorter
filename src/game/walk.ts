import { BOMB } from '../core/constants'
import { nextRange } from '../core/rng'
import type { Bomb, Rect, RngState } from '../core/types'

/**
 * よちよち歩き。
 *
 * 落下させないのは「触ってないのに誤爆死」を防ぐため。代わりに自分の足で
 * フィールドの中を歩き回る。ときどき向きを変え、壁に当たったら跳ね返る。
 */
export function walkBombs(
  bombs: readonly Bomb[],
  dt: number,
  field: Rect,
  scale: number,
  rng: RngState
): void {
  const r = BOMB.RADIUS

  for (const b of bombs) {
    // 足の運びは掴まれている間も進める（持ち上げられて足をばたつかせる感じ）
    const pace = b.grabbedBy !== null ? 1.4 : b.speed / BOMB.WALK_BASE
    b.step += dt * BOMB.STEP_HZ * Math.PI * 2 * pace

    if (b.grabbedBy !== null || b.vanish > 0) continue

    b.turnTimer -= dt
    if (b.turnTimer <= 0) {
      b.dir += nextRange(rng, -1.4, 1.4)
      b.speed = BOMB.WALK_BASE * scale * nextRange(rng, 0.7, 1.2)
      b.turnTimer = nextRange(rng, BOMB.TURN_MIN_SEC, BOMB.TURN_MAX_SEC)
    }

    b.x += Math.cos(b.dir) * b.speed * dt
    b.y += Math.sin(b.dir) * b.speed * dt

    // 壁で反射する。角に詰まらないよう、向きそのものを折り返す
    if (b.x < field.x + r) {
      b.x = field.x + r
      b.dir = Math.PI - b.dir
    } else if (b.x > field.x + field.w - r) {
      b.x = field.x + field.w - r
      b.dir = Math.PI - b.dir
    }
    if (b.y < field.y + r) {
      b.y = field.y + r
      b.dir = -b.dir
    } else if (b.y > field.y + field.h - r) {
      b.y = field.y + field.h - r
      b.dir = -b.dir
    }

    b.facing = Math.cos(b.dir) < 0 ? -1 : 1
  }
}
