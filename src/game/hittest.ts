import { BOMB } from '../core/constants'
import { inCircle } from '../core/math'
import type { Bomb, Layout, Rect, Zone } from '../core/types'

/** 矩形の内側か。境界は左上を含み右下を含まない、で一貫させる */
export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
}

/**
 * 座標にあるボムを拾う。配列後方（= 描画で手前）から探すので、
 * 重なっている場合は見えている方が掴まれる。
 * すでに掴まれているボムと消滅中のボムは対象外。
 */
export function pickBombAt(bombs: readonly Bomb[], x: number, y: number): Bomb | null {
  const r = BOMB.RADIUS + BOMB.HIT_BONUS
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i]
    if (!b) continue
    if (b.grabbedBy !== null || b.vanish > 0) continue
    if (inCircle(x, y, b.x, b.y, r)) return b
  }
  return null
}

/** 座標がどの仕分けゾーンの上か。どこでもなければ null */
export function zoneAt(layout: Layout, x: number, y: number): Zone | null {
  for (const z of layout.zones) {
    if (containsPoint(z.rect, x, y)) return z
  }
  return null
}
