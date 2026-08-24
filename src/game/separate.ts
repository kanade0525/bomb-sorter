import { BOMB } from '../core/constants'
import type { Bomb, Rect } from '../core/types'

/**
 * ボム同士を押し合って重なりを解く。
 * 完全に重なると下のボムが掴めなくなり「触れないのに時間切れで死ぬ」事故になるので、
 * 見た目の都合ではなく操作性のために必要な処理。
 */
export function separateBombs(bombs: Bomb[], field: Rect): void {
  const r = BOMB.RADIUS
  const min = r * 2
  const min2 = min * min

  for (let i = 0; i < bombs.length; i++) {
    const a = bombs[i]
    if (!a || a.vanish > 0) continue
    for (let j = i + 1; j < bombs.length; j++) {
      const b = bombs[j]
      if (!b || b.vanish > 0) continue

      const dx = b.x - a.x
      const dy = b.y - a.y
      const d2 = dx * dx + dy * dy
      if (d2 >= min2) continue

      // 完全に同一座標のときは決め打ちの向きへ逃がす（0 除算回避）
      const d = Math.sqrt(d2) || 0.0001
      const nx = d2 === 0 ? 1 : dx / d
      const ny = d2 === 0 ? 0 : dy / d
      const push = (min - d) / 2

      // 掴まれているボムは指に従わせたいので動かさず、相手だけを押しのける
      if (a.grabbedBy !== null && b.grabbedBy !== null) continue
      if (a.grabbedBy !== null) {
        b.x += nx * push * 2
        b.y += ny * push * 2
      } else if (b.grabbedBy !== null) {
        a.x -= nx * push * 2
        a.y -= ny * push * 2
      } else {
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
  }

  for (const b of bombs) {
    if (b.grabbedBy !== null || b.vanish > 0) continue
    b.x = Math.min(Math.max(b.x, field.x + r), field.x + field.w - r)
    b.y = Math.min(Math.max(b.y, field.y + r), field.y + field.h - r)
  }
}
