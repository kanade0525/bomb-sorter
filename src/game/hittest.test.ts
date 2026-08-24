import { describe, expect, it } from 'vitest'
import { BOMB } from '../core/constants'
import type { Bomb } from '../core/types'
import { computeLayout } from '../view/layout'
import { containsPoint, pickBombAt, zoneAt } from './hittest'
import { createBomb } from './world'

function bomb(id: number, x: number, y: number, over: Partial<Bomb> = {}): Bomb {
  return { ...createBomb(id, 'round', x, y, 0, 0, 9, 0), ...over }
}

describe('containsPoint', () => {
  const r = { x: 10, y: 20, w: 100, h: 50 }

  it('内側の点を含む', () => {
    expect(containsPoint(r, 50, 40)).toBe(true)
  })

  it('左上の境界は含み、右下の境界は含まない', () => {
    expect(containsPoint(r, 10, 20)).toBe(true)
    expect(containsPoint(r, 110, 70)).toBe(false)
    expect(containsPoint(r, 109.99, 69.99)).toBe(true)
  })

  it('外側の点を含まない', () => {
    expect(containsPoint(r, 9, 40)).toBe(false)
    expect(containsPoint(r, 50, 19)).toBe(false)
  })
})

describe('pickBombAt', () => {
  it('中心を触れば掴める', () => {
    const b = bomb(1, 100, 100)
    expect(pickBombAt([b], 100, 100)?.id).toBe(1)
  })

  it('判定は半径に HIT_BONUS ぶん余裕がある', () => {
    const b = bomb(1, 100, 100)
    const edge = BOMB.RADIUS + BOMB.HIT_BONUS - 0.5
    expect(pickBombAt([b], 100 + edge, 100)?.id).toBe(1)
    expect(pickBombAt([b], 100 + BOMB.RADIUS + BOMB.HIT_BONUS + 1, 100)).toBeNull()
  })

  it('重なったときは手前（配列後方）が掴まれる', () => {
    const back = bomb(1, 100, 100)
    const front = bomb(2, 105, 100)
    expect(pickBombAt([back, front], 103, 100)?.id).toBe(2)
  })

  it('すでに掴まれているボムは対象外', () => {
    const b = bomb(1, 100, 100, { grabbedBy: 7 })
    expect(pickBombAt([b], 100, 100)).toBeNull()
  })

  it('消滅中のボムは対象外', () => {
    const b = bomb(1, 100, 100, { vanish: 0.5 })
    expect(pickBombAt([b], 100, 100)).toBeNull()
  })

  it('何もない場所では null', () => {
    expect(pickBombAt([], 10, 10)).toBeNull()
  })
})

describe('zoneAt', () => {
  const layout = computeLayout(360, 640)

  it('各ゾーンの中心はそのゾーンと判定される', () => {
    for (const z of layout.zones) {
      const cx = z.rect.x + z.rect.w / 2
      const cy = z.rect.y + z.rect.h / 2
      expect(zoneAt(layout, cx, cy)?.kind).toBe(z.kind)
    }
  })

  it('左が しかく、右が まる で固定されている', () => {
    expect(layout.zones[0]?.kind).toBe('square')
    expect(layout.zones[1]?.kind).toBe('round')
    expect(layout.zones[0]!.rect.x).toBeLessThan(layout.zones[1]!.rect.x)
  })

  it('フィールドの中央はどのゾーンでもない', () => {
    const f = layout.field
    expect(zoneAt(layout, f.x + f.w / 2, f.y + f.h / 2)).toBeNull()
  })

  it('ゾーンの隙間はどのゾーンでもない', () => {
    const left = layout.zones[0]!.rect
    const right = layout.zones[1]!.rect
    const gapX = (left.x + left.w + right.x) / 2
    expect(zoneAt(layout, gapX, left.y + 10)).toBeNull()
  })
})
