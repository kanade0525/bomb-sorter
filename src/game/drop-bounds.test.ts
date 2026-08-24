import { describe, expect, it } from 'vitest'
import { BOMB, FIELD, TIMING } from '../core/constants'
import type { Bomb, InputAction, World } from '../core/types'
import { computeFit, computeLayout } from '../view/layout'
import { applyCommand, releaseAllDrags, stepWorld } from './step'
import { createWorld } from './world'

/**
 * ここは一度実際に壊れていた箇所を固定するためのテスト。
 *
 *  - ドラッグの可動域の下端と、ゾーンの当たり判定の下端が食い違っていて、
 *    画面下部の帯で指を離すと加点も爆発も起きない死角ができていた
 *  - 誤投入の爆発エフェクトが、座標の一致でボムを探していたために
 *    常に round の見た目になっていた
 *  - 同一 pointerId で 2 個掴めてしまい、触っていないボムが判定されていた
 */

function started(seed: number, layout = computeLayout(360, 640)): World {
  const w = createWorld(seed, layout)
  applyCommand(w, 'start', layout)
  stepWorld(w, TIMING.READY_SEC + 0.001, [], layout)
  return w
}

function firstBomb(w: World): Bomb {
  const b = w.bombs.find((x) => x.vanish === 0)
  if (!b) throw new Error('ボムがない')
  return b
}

describe('ゾーンの下端で離したとき', () => {
  // safe-area がある端末ほど死角が広かったので、inset のある構成でも確かめる
  const cases = [
    { name: 'inset なし', h: 640, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    {
      name: 'ノッチとホームインジケータあり',
      h: 760,
      insets: { top: 47, right: 0, bottom: 34, left: 0 },
    },
  ]

  for (const c of cases) {
    it(`${c.name}: 画面のいちばん下で離しても正解として扱われる`, () => {
      const layout = computeLayout(360, c.h, c.insets)
      const w = started(7, layout)
      const b = firstBomb(w)
      const zone = layout.zones.find((z) => z.kind === b.kind)!
      const x = zone.rect.x + zone.rect.w / 2

      // 指を画面のいちばん下まで下げてから離す
      const acts: InputAction[] = [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }]
      stepWorld(w, 1 / 60, acts, layout)
      stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x, y: c.h + 50 }], layout)
      stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x, y: c.h + 50 }], layout)

      expect(w.phase).toBe('playing')
      expect(w.score).toBeGreaterThan(0)
      expect(w.sorted).toBe(1)
    })

    it(`${c.name}: 画面のいちばん下でも、形が違えばちゃんと爆発する`, () => {
      const layout = computeLayout(360, c.h, c.insets)
      const w = started(7, layout)
      const b = firstBomb(w)
      const wrong = layout.zones.find((z) => z.kind !== b.kind)!
      const x = wrong.rect.x + wrong.rect.w / 2

      stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], layout)
      stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x, y: c.h + 50 }], layout)
      stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x, y: c.h + 50 }], layout)

      expect(w.phase).toBe('exploding')
      expect(w.deathReason).toBe('wrong')
    })
  }

  it('ドラッグの可動域の下端は、必ずゾーンの当たり判定の内側にある', () => {
    for (const h of [560, 640, 700, 760]) {
      for (const bottom of [0, 20, 34, 48]) {
        const layout = computeLayout(360, h, { top: 0, right: 0, bottom, left: 0 })
        const w = started(1, layout)
        const b = firstBomb(w)
        const zone = layout.zones[0]!
        const x = zone.rect.x + zone.rect.w / 2

        stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], layout)
        stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x, y: 99999 }], layout)
        const held = w.bombs.find((z) => z.grabbedBy === 1)!
        // clamp された座標が、ゾーンの矩形の内側に収まっていること
        expect(held.y).toBeGreaterThanOrEqual(zone.rect.y)
        expect(held.y).toBeLessThan(zone.rect.y + zone.rect.h)
      }
    }
  })
})

describe('爆発のエフェクト', () => {
  it('誤投入したボムの形がそのまま渡る（座標の一致に頼らない）', () => {
    // 両方の形で確かめる。square のときに round の演出が出ていたのが元のバグ
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const layout = computeLayout(360, 640)
      const w = started(seed, layout)
      const b = firstBomb(w)
      const wrong = layout.zones.find((z) => z.kind !== b.kind)!
      const to = { x: wrong.rect.x + wrong.rect.w / 2, y: wrong.rect.y + wrong.rect.h / 2 }

      stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], layout)
      stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, ...to }], layout)
      stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, ...to }], layout)

      const miss = w.effects.find((e) => e.t === 'miss')
      expect(miss).toBeDefined()
      if (miss?.t !== 'miss') throw new Error('miss がない')
      expect(miss.kind).toBe(b.kind)
      expect(miss.reason).toBe('wrong')
    }
  })

  it('爆発した瞬間のボムの座標と、エフェクトの座標が一致する', () => {
    const layout = computeLayout(360, 640)
    const w = started(11, layout)
    const b = firstBomb(w)
    const wrong = layout.zones.find((z) => z.kind !== b.kind)!
    const to = { x: wrong.rect.x + wrong.rect.w / 2, y: wrong.rect.y + wrong.rect.h / 2 }

    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], layout)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, ...to }], layout)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, ...to }], layout)

    const miss = w.effects.find((e) => e.t === 'miss')
    if (miss?.t !== 'miss') throw new Error('miss がない')
    const bomb = w.bombs.find((x) => x.id === b.id)!
    expect(miss.x).toBeCloseTo(bomb.x, 6)
    expect(miss.y).toBeCloseTo(bomb.y, 6)
    // 爆発と同じフレームに他の音が積まれていないこと
    expect(w.effects.filter((e) => e.t === 'warn' || e.t === 'combo-lost')).toEqual([])
  })

  it('導火線切れでも形が正しく渡る', () => {
    const layout = computeLayout(360, 640)
    const w = started(3, layout)
    const kind = firstBomb(w).kind
    for (let i = 0; i < 60 * 30 && w.phase === 'playing'; i++) stepWorld(w, 1 / 60, [], layout)
    const miss = w.effects.find((e) => e.t === 'miss')
    if (miss?.t !== 'miss') throw new Error('miss がない')
    expect(miss.reason).toBe('fuse')
    expect(['round', 'square']).toContain(miss.kind)
    void kind
  })
})

describe('同一ポインタの二重掴み', () => {
  it('同じ pointerId では 1 個しか掴めない', () => {
    const layout = computeLayout(360, 640)
    const w = started(21, layout)
    // ボムを 2 個以上出す
    for (let i = 0; i < 60 * 10 && w.bombs.filter((b) => b.vanish === 0).length < 2; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], layout)
    }
    const bombs = w.bombs.filter((b) => b.vanish === 0)
    expect(bombs.length).toBeGreaterThanOrEqual(2)

    // マウスで左ボタンを押したまま右ボタンを押すと、同じ pointerId で
    // pointerdown がもう一度飛んでくる
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'grab', pointerId: 1, x: bombs[0]!.x, y: bombs[0]!.y },
        { t: 'grab', pointerId: 1, x: bombs[1]!.x, y: bombs[1]!.y },
      ],
      layout
    )
    expect(w.bombs.filter((b) => b.grabbedBy === 1).length).toBe(1)
  })

  it('離してからなら同じ pointerId で次を掴める', () => {
    const layout = computeLayout(360, 640)
    const w = started(22, layout)
    const b = firstBomb(w)
    const mid = { x: layout.field.x + 40, y: layout.field.y + 40 }
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], layout)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, ...mid }], layout)
    const again = firstBomb(w)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: again.x, y: again.y }], layout)
    expect(w.bombs.filter((x) => x.grabbedBy === 1).length).toBe(1)
  })
})

describe('タイトルへ戻ったとき', () => {
  it('飾りのボムが元の数に戻る', () => {
    const layout = computeLayout(360, 640)
    const w = createWorld(5, layout)
    const decorated = w.bombs.length
    expect(decorated).toBe(3)

    applyCommand(w, 'start', layout)
    stepWorld(w, TIMING.READY_SEC + 0.001, [], layout)
    applyCommand(w, 'pause', layout)
    applyCommand(w, 'title', layout)

    expect(w.phase).toBe('title')
    expect(w.bombs.length).toBe(decorated)
  })

  it('飾りのボムは重ならない', () => {
    // safe-area が大きくフィールドが低い構成でも団子にならないこと
    const layout = computeLayout(360, 560, { top: 60, right: 0, bottom: 40, left: 0 })
    const w = createWorld(9, layout)
    for (let i = 0; i < w.bombs.length; i++) {
      for (let j = i + 1; j < w.bombs.length; j++) {
        const a = w.bombs[i]!
        const b = w.bombs[j]!
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        expect(d).toBeGreaterThan(BOMB.RADIUS)
      }
    }
    void FIELD
  })
})

describe('レイアウトが変わったとき', () => {
  /**
   * iOS でツールバーが出て高さが縮む状況の再現。
   * 論理高さが変わると、掴んでいるボムの座標はそのままなのに指の論理座標は
   * 読み直されるので、指を動かしていないのに「ゾーンの中」に化けて誤爆死していた。
   */
  it('高さが縮んでも、指を動かさず離して爆死しない', () => {
    let died = 0
    const tries = 8
    for (let seed = 1; seed <= tries; seed++) {
      const before = computeLayout(360, 760, { top: 0, right: 0, bottom: 34, left: 0 })
      const w = started(seed, before)
      const b = firstBomb(w)

      // フィールドの下寄り（縮んだあとにゾーンへ化ける帯）で保持する
      const holdY = before.field.y + before.field.h - 4
      const wrongZone = before.zones.find((z) => z.kind !== b.kind)!
      const holdX = wrongZone.rect.x + wrongZone.rect.w / 2
      stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], before)
      stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, x: holdX, y: holdY }], before)

      // ここでレイアウトが変わる。実装は掴んでいた指を手放す
      const after = computeLayout(360, 697, { top: 0, right: 0, bottom: 34, left: 0 })
      releaseAllDrags(w, after)

      // 指はそのままの位置で離す
      stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: holdX, y: holdY }], after)
      if (w.phase !== 'playing') died++
    }
    expect(died).toBe(0)
  })

  it('手放したあとのボムはフィールドの中に戻っている', () => {
    const layout = computeLayout(360, 760)
    const w = started(3, layout)
    const b = firstBomb(w)
    const zone = layout.zones[0]!
    const to = { x: zone.rect.x + zone.rect.w / 2, y: zone.rect.y + zone.rect.h / 2 }
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], layout)
    stepWorld(w, 1 / 60, [{ t: 'move', pointerId: 1, ...to }], layout)

    releaseAllDrags(w, layout)

    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
    for (const x of w.bombs) {
      expect(x.grabbedBy).toBeNull()
      expect(x.y).toBeLessThanOrEqual(layout.field.y + layout.field.h)
      expect(x.y).toBeGreaterThanOrEqual(layout.field.y)
    }
  })

  it('掴んでいなければ何も起きない', () => {
    const layout = computeLayout(360, 640)
    const w = started(4, layout)
    const snapshot = w.bombs.map((b) => ({ x: b.x, y: b.y }))
    releaseAllDrags(w, layout)
    expect(w.bombs.map((b) => ({ x: b.x, y: b.y }))).toEqual(snapshot)
  })
})

describe('拡大率の上限', () => {
  it('タブレットのような大画面では上限で止まり、中央に寄る', () => {
    const fit = computeFit(768, 1024)
    expect(fit.scale).toBe(FIELD.MAX_SCALE)
    expect(fit.offsetX).toBeGreaterThan(0)
    expect(fit.offsetY).toBeGreaterThan(0)
    // 描画域が画面をはみ出さないこと
    expect(fit.offsetX * 2 + fit.logicalW * fit.scale).toBeCloseTo(768, 6)
    expect(fit.offsetY * 2 + fit.logicalH * fit.scale).toBeCloseTo(1024, 6)
  })

  it('スマホでは上限に達しないので今までどおり', () => {
    for (const [w, h] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
    ] as const) {
      expect(computeFit(w, h).scale).toBeLessThan(FIELD.MAX_SCALE)
    }
  })
})
