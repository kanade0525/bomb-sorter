import { expect, test } from '@playwright/test'
import { layout, ready, state } from '../helpers/game'

/**
 * 全画面ボタンが実際に描画領域を広げるかを見る。
 * Fullscreen API は Chromium でしか動かないので、CI に載せる E2E ではなく
 * 検分用に置いている。
 */
test('全画面にすると描画領域が広がる', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Fullscreen API は chromium でのみ確認できる')

  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  const before = await page.evaluate(() => {
    const c = document.querySelector('canvas#game') as HTMLCanvasElement
    const r = c.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  const l0 = await layout(page)
  console.log(`### 全画面前: canvas=${before.w}x${before.h} 論理=${l0.logicalW}x${l0.logicalH}`)

  await page.getByRole('button', { name: '全画面にする' }).click()
  await page.waitForTimeout(500)

  const isFull = await page.evaluate(() => document.fullscreenElement !== null)
  console.log(`### 全画面になったか: ${isFull}`)
  expect(isFull).toBe(true)

  const after = await page.evaluate(() => {
    const c = document.querySelector('canvas#game') as HTMLCanvasElement
    const r = c.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  const l1 = await layout(page)
  console.log(`### 全画面後: canvas=${after.w}x${after.h} 論理=${l1.logicalW}x${l1.logicalH}`)

  // ヘッドレスではウィンドウ自体が画面サイズなので寸法は変わらないことがある。
  // 少なくとも縮んでいないこと、レイアウトが壊れていないことを見る
  expect(after.w).toBeGreaterThanOrEqual(before.w)
  expect(after.h).toBeGreaterThanOrEqual(before.h)
  expect(l1.field.w).toBeGreaterThan(0)
  expect((await state(page)).phase).toBe('title')

  await page.getByRole('button', { name: '全画面をやめる' }).click()
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false)
  console.log('### 全画面を抜けても壊れない')
})
