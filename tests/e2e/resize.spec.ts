import { expect, test } from '@playwright/test'
import { advanceBy, fitOf, layout, ready, startGame, state, zoneCenter } from '../helpers/game'

/**
 * iOS でツールバーが出入りすると画面の高さが変わる。
 * そのとき論理座標系も変わるので、掴んでいるボムと指の対応が崩れる。
 *
 * 一度、指を一切動かしていないのに離した瞬間に誤爆死する状態になっていた（6/6 再現）。
 * 実装側は relayout で進行中のドラッグを手放すようにしたので、その配線を見る。
 */

/** 画面座標のまま pointer イベントを送る（論理座標へ変換しないのが要点） */
async function fire(
  canvas: import('@playwright/test').Locator,
  type: string,
  x: number,
  y: number,
  buttons: number
) {
  await canvas.dispatchEvent(type, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    buttons,
    clientX: x,
    clientY: y,
  })
}

test('ドラッグ中に画面の高さが変わっても、指を動かさず離して爆死しない', async ({ page }) => {
  const size = page.viewportSize()
  test.skip(!size, 'ビューポートが取れない環境ではやらない')

  await page.goto('./?seed=31&frozen=1')
  await ready(page)
  await startGame(page)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const s = await state(page)
  const bomb = s.bombs.find((b) => b.vanish === 0)
  if (!bomb) throw new Error('ボムがない')

  // 誤ったゾーンの真上（縮んだあとにゾーンへ化ける帯）で保持する
  const wrong = zoneCenter(l, bomb.kind === 'round' ? 'square' : 'round')
  const holdLogical = { x: wrong.x, y: l.field.y + l.field.h - 6 }
  const clientX = fit.boxX + fit.offsetX + holdLogical.x * fit.scale
  const clientY = fit.boxY + fit.offsetY + holdLogical.y * fit.scale

  await fire(
    canvas,
    'pointerdown',
    fit.boxX + fit.offsetX + bomb.x * fit.scale,
    fit.boxY + fit.offsetY + bomb.y * fit.scale,
    1
  )
  await advanceBy(page, 40)
  await fire(canvas, 'pointermove', clientX, clientY, 1)
  await advanceBy(page, 40)

  // ツールバーが出て高さが 100px 縮む
  await page.setViewportSize({ width: size!.width, height: size!.height - 100 })
  // relayout はデバウンスされているので、反映を待つ
  await page.waitForTimeout(250)
  await advanceBy(page, 100)

  // 指はそのままの画面座標で離す
  await fire(canvas, 'pointerup', clientX, clientY, 0)
  await advanceBy(page, 100)

  const after = await state(page)
  expect(after.phase, '指を動かしていないのに死んではいけない').toBe('playing')
  expect(after.score).toBe(0)
  expect(after.bombs.every((b) => b.grabbedBy === null)).toBe(true)
})

test('高さが変わったあとも、新しい座標系で普通に仕分けできる', async ({ page }) => {
  const size = page.viewportSize()
  test.skip(!size, 'ビューポートが取れない環境ではやらない')

  await page.goto('./?seed=32&frozen=1')
  await ready(page)
  await startGame(page)

  await page.setViewportSize({ width: size!.width, height: size!.height - 120 })
  await page.waitForTimeout(250)
  await advanceBy(page, 200)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const s = await state(page)
  const bomb = s.bombs.find((b) => b.vanish === 0)
  if (!bomb) throw new Error('ボムがない')
  const to = zoneCenter(l, bomb.kind)

  await fire(
    canvas,
    'pointerdown',
    fit.boxX + fit.offsetX + bomb.x * fit.scale,
    fit.boxY + fit.offsetY + bomb.y * fit.scale,
    1
  )
  await advanceBy(page, 40)
  await fire(
    canvas,
    'pointermove',
    fit.boxX + fit.offsetX + to.x * fit.scale,
    fit.boxY + fit.offsetY + to.y * fit.scale,
    1
  )
  await advanceBy(page, 40)
  await fire(
    canvas,
    'pointerup',
    fit.boxX + fit.offsetX + to.x * fit.scale,
    fit.boxY + fit.offsetY + to.y * fit.scale,
    0
  )
  await advanceBy(page, 40)

  const after = await state(page)
  expect(after.phase).toBe('playing')
  expect(after.score).toBeGreaterThan(0)
})

test('上部のボタンは、レターボックスの内側に収まっている', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  // タブレットの横向き相当。黒帯の中にボタンだけが浮いていないこと
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.waitForTimeout(250)

  const box = await page.locator('#btn-mute').boundingBox()
  const l = await layout(page)
  const drawn = await page.evaluate(() => {
    const c = document.querySelector('canvas#game') as HTMLCanvasElement
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const scale = Math.min(drawn.w / l.logicalW, drawn.h / l.logicalH)
  const offsetX = (drawn.w - l.logicalW * scale) / 2
  const rightEdge = drawn.x + offsetX + l.logicalW * scale

  expect(box).not.toBeNull()
  // ボタンの右端が、実際に描かれているゲーム画面の右端から大きく離れていないこと
  expect(rightEdge - (box!.x + box!.width)).toBeGreaterThanOrEqual(-2)
  expect(rightEdge - (box!.x + box!.width)).toBeLessThan(24)
})
