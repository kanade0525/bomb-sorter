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

const KEY = 'bomb-sorter:save:v1'

test('ハイスコアが保存され、リロード後も表示される', async ({ page }) => {
  await page.goto('./?seed=555&frozen=1')
  await ready(page)
  await startGame(page)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bomb = (await state(page)).bombs[0]!
  await drag(page, canvas, fit, { x: bomb.x, y: bomb.y }, zoneCenter(l, bomb.kind))

  const score = (await state(page)).score
  expect(score).toBeGreaterThan(0)

  await advanceBy(page, 30_000)
  expect((await state(page)).phase).toBe('gameover')

  const saved = await page.evaluate((k) => localStorage.getItem(k), KEY)
  expect(saved).not.toBeNull()
  expect(JSON.parse(saved!).best).toBe(score)

  await page.reload()
  await ready(page)
  await expect(page.getByText(`ハイスコア ${score}`, { exact: false })).toBeVisible()
})

test('壊れた保存データでもクラッシュしない', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  await page.evaluate((k) => localStorage.setItem(k, '{{{ not json'), KEY)
  await page.reload()
  await ready(page)

  const s = await state(page)
  expect(s.phase).toBe('title')
  expect(errors).toEqual([])
})

test('ミュートの設定が保存される', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  const mute = page.getByRole('button', { name: '音を消す' })
  await mute.click()
  await expect(page.getByRole('button', { name: '音を出す' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  const saved = await page.evaluate((k) => localStorage.getItem(k), KEY)
  expect(JSON.parse(saved!).muted).toBe(true)

  await page.reload()
  await ready(page)
  await expect(page.getByRole('button', { name: '音を出す' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})
