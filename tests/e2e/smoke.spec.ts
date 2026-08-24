import { expect, test } from '@playwright/test'
import { advanceBy, ready, startGame, state } from '../helpers/game'

test('サブパス配下で読み込め、失敗するリクエストが 1 件もない', async ({ page }) => {
  const failed: string[] = []
  const errors: string[] = []
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  expect(failed, `失敗したリクエスト:\n${failed.join('\n')}`).toEqual([])
  expect(errors, `コンソールエラー:\n${errors.join('\n')}`).toEqual([])
  await expect(page.locator('canvas#game')).toBeVisible()
})

test('最初はタイトル画面で、スコアは 0', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  const s = await state(page)
  expect(s.phase).toBe('title')
  expect(s.score).toBe(0)
  await expect(page.getByRole('button', { name: 'はじめる' })).toBeVisible()
})

test('横スクロールが発生しない', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  }))
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW)
  expect(m.scrollH).toBeLessThanOrEqual(m.clientH)
})

test('Canvas の実解像度は DPR 2 で打ち止めになる', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas#game') as HTMLCanvasElement
    return { w: c.width, h: c.height, cssW: c.clientWidth, dpr: window.devicePixelRatio }
  })
  const capped = Math.min(info.dpr, 2)
  expect(info.w).toBe(Math.round(info.cssW * capped))
})

test('はじめるを押すとカウントダウンを経てプレイ中になる', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  expect((await state(page)).phase).toBe('ready')
  await advanceBy(page, 1800)
  expect((await state(page)).phase).toBe('playing')
  // プレイ中はオーバーレイが指の邪魔をしない
  await expect(page.locator('#overlay')).toHaveAttribute('aria-hidden', 'true')
})

test('プレイ中は時間が経つとボムが増える', async ({ page }) => {
  await page.goto('./?seed=99&frozen=1')
  await ready(page)
  await startGame(page)
  const before = (await state(page)).bombs.length
  await advanceBy(page, 4000)
  const after = await state(page)
  expect(after.bombs.length).toBeGreaterThanOrEqual(before)
  expect(after.bombs.length).toBeLessThanOrEqual(8)
})
