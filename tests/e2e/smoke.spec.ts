import { expect, test } from '@playwright/test'
import { SPAWN } from '../../src/core/constants'
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
  await expect(page.getByRole('button', { name: 'ゲーム開始' })).toBeVisible()
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
  await page.getByRole('button', { name: 'ゲーム開始' }).click()
  expect((await state(page)).phase).toBe('ready')
  await advanceBy(page, 1800)
  expect((await state(page)).phase).toBe('playing')
  // プレイ中はオーバーレイが指の邪魔をしない
  await expect(page.locator('#overlay')).toHaveAttribute('aria-hidden', 'true')
})

test('開始した時点でボムすけがうじゃうじゃ出ている', async ({ page }) => {
  await page.goto('./?seed=99&frozen=1')
  await ready(page)
  await startGame(page)

  // 落ち着いて 1 体ずつ運べる時間があると、それはもうパニックゲームではない
  // カウントダウンを抜けた直後には追加のスポーンが始まっているので、
  // ぴったりではなく「最初のひと山ぶんは必ず出ている」を見る
  const before = (await state(page)).bombs.length
  expect(before).toBeGreaterThanOrEqual(SPAWN.BURST_AT_START)

  await advanceBy(page, 4000)
  const after = await state(page)
  expect(after.bombs.length).toBeGreaterThanOrEqual(before)
  // ただし上限は超えない
  expect(after.bombs.length).toBeLessThanOrEqual(SPAWN.ALIVE_CAP)
})
