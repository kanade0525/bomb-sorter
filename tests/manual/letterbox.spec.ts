import { test, expect } from '@playwright/test'
import { layout, ready } from '../helpers/game'

const SIZES = [
  { w: 360, h: 640, name: '標準' },
  { w: 768, h: 1024, name: 'iPad 縦' },
  { w: 1024, h: 768, name: 'iPad 横' },
  { w: 1440, h: 900, name: 'PC' },
]

for (const s of SIZES) {
  test(`HUD ボタンとレターボックスの整合 ${s.w}x${s.h} (${s.name})`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto('./?frozen=1')
    await ready(page)
    const l = await layout(page)
    const scale = Math.min(s.w / l.logicalW, s.h / l.logicalH)
    const contentLeft = (s.w - l.logicalW * scale) / 2
    const contentRight = contentLeft + l.logicalW * scale
    const mute = (await page.locator('#btn-mute').boundingBox())!
    const pause = await page.locator('#btn-pause').boundingBox()
    // HUD（Canvas 上）の右端の CSS 座標
    const hudRightCss = contentLeft + (l.hud.x + l.hud.w) * scale
    const gap = mute.x - hudRightCss
    console.log(
      `### ${s.w}x${s.h} logicalH=${l.logicalH} scale=${scale.toFixed(3)} ` +
        `ゲーム描画域 x=[${contentLeft.toFixed(1)}, ${contentRight.toFixed(1)}] ` +
        `HUD右端=${hudRightCss.toFixed(1)} ミュートボタン x=[${mute.x.toFixed(1)}, ${(mute.x + mute.width).toFixed(1)}] ` +
        `ポーズ=${pause ? `x=[${pause.x.toFixed(1)}, ${(pause.x + pause.width).toFixed(1)}]` : '非表示'} ` +
        `HUD右端との間隔=${gap.toFixed(1)}px ` +
        `→ ミュート右端と描画域右端のズレ=${(mute.x + mute.width - contentRight).toFixed(1)}px`
    )
    // タップ領域 44px 以上か
    console.log(
      `### ${s.w}x${s.h} ボタンサイズ mute=${mute.width.toFixed(0)}x${mute.height.toFixed(0)} pause=${pause ? `${pause.width.toFixed(0)}x${pause.height.toFixed(0)}` : '非表示'}`
    )
    expect(mute.width).toBeGreaterThanOrEqual(44)
    expect(mute.height).toBeGreaterThanOrEqual(44)
  })
}
