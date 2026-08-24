import { test } from '@playwright/test'
import { advanceBy, drag, fitOf, layout, ready, startGame, state, zoneCenter } from '../helpers/game'

/**
 * 目視確認用のスクリーンショットを撮る。
 *
 * 画像比較（toHaveScreenshot）はあえて使わない。Canvas のアニメーションと
 * フォント描画の差で CI が必ず不安定になり、--update-snapshots を惰性で叩く運用に堕落する。
 * 機械判定は getState() の数値で行い、スクショは人が見るためのものと割り切る。
 */
test.describe.configure({ mode: 'serial' })

const OUT = 'shots'

test('主要な画面を撮る', async ({ page }, info) => {
  const dev = info.project.name
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${dev}-${name}.png` })

  await page.goto('./?seed=20260825&frozen=1')
  await ready(page)
  await page.evaluate(() => document.fonts.ready)

  // 1) タイトル
  await shot('01-title')

  // 2) プレイ開始直後
  await startGame(page)
  await advanceBy(page, 1200)
  await shot('02-playing')

  // 3) ボムが増えて導火線が減った状態
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 300; i++) h.advance(16)
  })
  await shot('03-busy')

  // 4) 掴んでゾーンの上にいる状態（ハイライトの見え方を見る）
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const s = await state(page)
  const bomb = s.bombs.find((b) => b.vanish === 0)
  if (bomb && s.phase === 'playing') {
    const to = zoneCenter(l, bomb.kind)
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      buttons: 1,
      clientX: fit.boxX + fit.offsetX + bomb.x * fit.scale,
      clientY: fit.boxY + fit.offsetY + bomb.y * fit.scale,
    })
    await advanceBy(page, 32)
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      buttons: 1,
      clientX: fit.boxX + fit.offsetX + to.x * fit.scale,
      clientY: fit.boxY + fit.offsetY + to.y * fit.scale,
    })
    await advanceBy(page, 32)
    await shot('04-hover')

    // 5) 正解してコンボが乗った状態
    await canvas.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      buttons: 0,
      clientX: fit.boxX + fit.offsetX + to.x * fit.scale,
      clientY: fit.boxY + fit.offsetY + to.y * fit.scale,
    })
    await advanceBy(page, 64)
    await shot('05-success')
  }

  // 6) 一時停止
  await page.evaluate(() => window.__BOMB_SORTER__!.command('pause'))
  await advanceBy(page, 32)
  await shot('06-paused')
  await page.evaluate(() => window.__BOMB_SORTER__!.command('resume'))
  await advanceBy(page, 2000)

  // 7) 何度か正解してスコアを積んでから
  for (let i = 0; i < 4; i++) {
    const st = await state(page)
    if (st.phase !== 'playing') break
    const b = st.bombs.find((x) => x.vanish === 0)
    if (!b) break
    await drag(page, canvas, fit, { x: b.x, y: b.y }, zoneCenter(l, b.kind), 4)
    await page.evaluate(() => {
      const h = window.__BOMB_SORTER__!
      h.advance(16)
      for (let k = 0; k < 120 && h.getState().bombs.filter((x) => x.vanish === 0).length === 0; k++) {
        h.advance(16)
      }
    })
  }
  await shot('07-scored')

  // 8) ゲームオーバー
  await advanceBy(page, 30_000)
  await shot('08-gameover')
})
