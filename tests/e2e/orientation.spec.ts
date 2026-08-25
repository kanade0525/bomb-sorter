import { expect, test } from '@playwright/test'
import {
  advanceBy,
  drag,
  fitOf,
  layout,
  ready,
  startGame,
  state,
  zoneCenter,
} from '../helpers/game'

/**
 * 縦持ちと横持ちの両方で遊べること。
 *
 * 一度「横持ち専用」にして縦を案内で弾いていたので、両対応に戻したことを
 * ここで固定しておく。向きで変わるのはレイアウトだけで、ルールは変わらない。
 */

const SIZES = [
  { name: '縦持ち', w: 402, h: 681 },
  { name: '横持ち', w: 681, h: 402 },
  { name: '縦持ち・小さい画面', w: 320, h: 568 },
  { name: '横持ち・小さい画面', w: 568, h: 320 },
]

for (const s of SIZES) {
  test(`${s.name}: 遊べて、同じ色の箱へ入れると加点される`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto('./?seed=2024&frozen=1')
    await ready(page)
    await startGame(page)

    const canvas = page.locator('canvas#game')
    const l = await layout(page)
    const fit = await fitOf(canvas, l)
    const bomb = (await state(page)).bombs.find((b) => b.vanish === 0)
    if (!bomb) throw new Error('ボムすけがいない')

    await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, bomb.kind))

    const after = await state(page)
    expect(after.phase).toBe('playing')
    expect(after.score).toBeGreaterThan(0)
    expect(after.sorted).toBe(1)
    // 仕分けたぶんが箱の中に残る
    expect(after.stored[bomb.kind].length).toBe(1)
  })

  test(`${s.name}: 箱もフィールドも画面の中に収まっている`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto('./?seed=1&frozen=1')
    await ready(page)

    const l = await layout(page)
    const portrait = l.logicalH > l.logicalW
    expect(portrait).toBe(s.h > s.w)

    for (const r of [l.hud, l.field, ...l.zones.map((z) => z.rect)]) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(l.logicalW)
      expect(r.y + r.h).toBeLessThanOrEqual(l.logicalH)
    }
    // 左が赤、右が黒。向きが変わっても並びは同じ
    expect(l.zones[0]!.kind).toBe('red')
    expect(l.zones[1]!.kind).toBe('black')
    expect(l.zones[0]!.rect.x).toBeLessThan(l.zones[1]!.rect.x)
  })
}

test('遊んでいる途中で向きを変えても、そのまま続けられる', async ({ page }) => {
  await page.setViewportSize({ width: 681, height: 402 })
  await page.goto('./?seed=77&frozen=1')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 1000)
  const before = await state(page)
  expect(before.phase).toBe('playing')

  // 横 → 縦
  await page.setViewportSize({ width: 402, height: 681 })
  await page.waitForTimeout(300)
  await advanceBy(page, 300)

  const mid = await state(page)
  const l = await layout(page)
  expect(mid.phase, '向きを変えただけで死んではいけない').toBe('playing')
  expect(l.logicalH).toBeGreaterThan(l.logicalW)
  // ボムすけは新しいフィールドの中へ収まっている
  for (const b of mid.bombs) {
    if (b.grabbedBy !== null || b.vanish > 0) continue
    expect(b.x).toBeGreaterThanOrEqual(l.field.x - 1)
    expect(b.x).toBeLessThanOrEqual(l.field.x + l.field.w + 1)
    expect(b.y).toBeGreaterThanOrEqual(l.field.y - 1)
    expect(b.y).toBeLessThanOrEqual(l.field.y + l.field.h + 1)
  }

  // 縦になったあとも仕分けできる
  const canvas = page.locator('canvas#game')
  const fit = await fitOf(canvas, l)
  const bomb = mid.bombs.find((b) => b.vanish === 0)!
  await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, bomb.kind))
  const after = await state(page)
  expect(after.phase).toBe('playing')
  expect(after.score).toBeGreaterThan(0)
})
