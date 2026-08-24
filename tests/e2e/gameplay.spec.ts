import { expect, test } from '@playwright/test'
import {
  advanceBy,
  cancelDrag,
  drag,
  fitOf,
  grabOnly,
  layout,
  ready,
  startGame,
  state,
  zoneCenter,
} from '../helpers/game'

test.beforeEach(async ({ page }) => {
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)
})

test('同じ形のばしょへ運ぶとスコアが増える', async ({ page }) => {
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const s0 = await state(page)
  const bomb = s0.bombs[0]!

  await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, bomb.kind))

  const s1 = await state(page)
  expect(s1.phase).toBe('playing')
  expect(s1.score).toBeGreaterThan(0)
  expect(s1.sorted).toBe(1)
  expect(s1.combo).toBe(1)
})

test('ちがう形のばしょへ入れるとゲームオーバーになる', async ({ page }) => {
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bomb = (await state(page)).bombs[0]!
  const wrong = bomb.kind === 'round' ? 'square' : 'round'

  await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, wrong))
  expect((await state(page)).phase).toBe('exploding')

  await advanceBy(page, 1200)
  const s = await state(page)
  expect(s.phase).toBe('gameover')
  expect(s.deathReason).toBe('wrong')
  await expect(page.getByText('ちがう ばしょへ いれた')).toBeVisible()
  await expect(page.getByRole('button', { name: 'もう一度' })).toBeVisible()
})

test('連続で成功するとコンボが表示される', async ({ page }) => {
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)

  for (let i = 0; i < 3; i++) {
    // 次のボムをすぐ出させて、コンボ窓が切れないようにする
    await page.evaluate(() => {
      const h = window.__BOMB_SORTER__!
      for (
        let k = 0;
        k < 200 && h.getState().bombs.filter((b) => b.vanish === 0).length === 0;
        k++
      ) {
        h.advance(16)
      }
    })
    const s = await state(page)
    const bomb = s.bombs.find((b) => b.vanish === 0)
    if (!bomb) break
    await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, bomb.kind))
    if ((await state(page)).phase !== 'playing') break
  }

  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.combo).toBeGreaterThanOrEqual(2)
  expect(s.score).toBeGreaterThan(200)
})

test('放置すると導火線が尽きてゲームオーバーになる', async ({ page }) => {
  await advanceBy(page, 30_000)
  const s = await state(page)
  expect(s.phase).toBe('gameover')
  expect(s.deathReason).toBe('fuse')
  await expect(page.getByText('どうかせんが つきた')).toBeVisible()
})

test('ドラッグ中に指が離れても（通知など）ミスにならない', async ({ page }) => {
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bomb = (await state(page)).bombs[0]!
  const wrong = zoneCenter(l, bomb.kind === 'round' ? 'square' : 'round')

  await grabOnly(canvas, fit, { x: bomb.x, y: bomb.y })
  await advanceBy(page, 32)
  await cancelDrag(canvas, fit, wrong)
  await advanceBy(page, 32)

  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.bombs.every((b) => b.grabbedBy === null)).toBe(true)
})

test('一時停止すると時間が止まり、再開はカウントダウンから', async ({ page }) => {
  await page.getByRole('button', { name: '一時停止' }).click()
  expect((await state(page)).phase).toBe('paused')
  const t = (await state(page)).time
  await advanceBy(page, 3000)
  expect((await state(page)).time).toBe(t)

  await page.getByRole('button', { name: 'つづける' }).click()
  expect((await state(page)).phase).toBe('ready')
  await advanceBy(page, 1800)
  expect((await state(page)).phase).toBe('playing')
})

test('もう一度でスコアが 0 に戻る', async ({ page }) => {
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bomb = (await state(page)).bombs[0]!
  await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, bomb.kind))
  expect((await state(page)).score).toBeGreaterThan(0)

  await advanceBy(page, 30_000)
  expect((await state(page)).phase).toBe('gameover')

  await page.getByRole('button', { name: 'もう一度' }).click()
  await advanceBy(page, 1800)
  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.score).toBe(0)
  expect(s.combo).toBe(0)
})
