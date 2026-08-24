import type { Locator, Page } from '@playwright/test'

/**
 * Canvas ゲームを検証するための道具。
 *
 * ドラッグは page.touchscreen（タップ専用）でも page.mouse（実装が pointer 系だけを
 * 見ている場合に届かない）でもなく、Pointer Events を dispatchEvent で直接送る。
 * これが実装に一番忠実で確実。
 */

export interface Vec {
  x: number
  y: number
}

export interface Fit {
  scale: number
  offsetX: number
  offsetY: number
  boxX: number
  boxY: number
}

/** 論理座標 → ページの CSS 座標。実装の computeFit と同じ式で組む */
export async function fitOf(canvas: Locator, logicalH: number): Promise<Fit> {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas の矩形が取れない')
  const scale = Math.min(box.width / 360, box.height / logicalH)
  return {
    scale,
    offsetX: (box.width - 360 * scale) / 2,
    offsetY: (box.height - logicalH * scale) / 2,
    boxX: box.x,
    boxY: box.y,
  }
}

export function toClient(fit: Fit, p: Vec): Vec {
  return {
    x: fit.boxX + fit.offsetX + p.x * fit.scale,
    y: fit.boxY + fit.offsetY + p.y * fit.scale,
  }
}

async function fire(
  canvas: Locator,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  p: Vec,
  pointerId = 1
): Promise<void> {
  await canvas.dispatchEvent(type, {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    clientX: p.x,
    clientY: p.y,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  })
}

/**
 * 論理座標でドラッグする。1 ステップごとにゲームを 1 フレーム進める。
 *
 * 進める量を 20ms にしているのは、planSteps が固定タイムステップ（16.67ms）で
 * 切り捨てるため。16ms を渡すと 0 ステップになる回があり、直前に resetClock が
 * 走っていた場合（リサイズ直後など）は入力が 1 フレーム処理されずに残る。
 */
export async function drag(
  page: Page,
  canvas: Locator,
  fit: Fit,
  from: Vec,
  to: Vec,
  steps = 8,
  pointerId = 1
): Promise<void> {
  await fire(canvas, 'pointerdown', toClient(fit, from), pointerId)
  await advance(page, 20)
  for (let i = 1; i <= steps; i++) {
    const p = {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    }
    await fire(canvas, 'pointermove', toClient(fit, p), pointerId)
    await advance(page, 20)
  }
  await fire(canvas, 'pointerup', toClient(fit, to), pointerId)
  await advance(page, 20)
}

/** 掴んだまま離さない */
export async function grabOnly(canvas: Locator, fit: Fit, at: Vec, pointerId = 1): Promise<void> {
  await fire(canvas, 'pointerdown', toClient(fit, at), pointerId)
}

export async function cancelDrag(canvas: Locator, fit: Fit, at: Vec, pointerId = 1): Promise<void> {
  await fire(canvas, 'pointercancel', toClient(fit, at), pointerId)
}

export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
}

export async function state(page: Page) {
  return page.evaluate(() => window.__BOMB_SORTER__!.getState())
}

export async function layout(page: Page) {
  return page.evaluate(() => window.__BOMB_SORTER__!.getLayout())
}

export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((n) => window.__BOMB_SORTER__!.advance(n), ms)
}

/** 指定ミリ秒ぶん、20ms 刻みで進める（1 回で必ず 1 フレーム以上進む刻み） */
export async function advanceBy(page: Page, totalMs: number): Promise<void> {
  await page.evaluate((n) => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < Math.ceil(n / 20); i++) h.advance(20)
  }, totalMs)
}

/** ゲームを開始して playing になるまで進める */
export async function startGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'はじめる' }).click()
  await advanceBy(page, 1800)
  await page.waitForFunction(() => window.__BOMB_SORTER__!.getState().phase === 'playing')
}

export function zoneCenter(l: Awaited<ReturnType<typeof layout>>, kind: 'round' | 'square'): Vec {
  const z = l.zones.find((x) => x.kind === kind)
  if (!z) throw new Error('ゾーンが無い')
  return { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 }
}
