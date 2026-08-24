import { test, expect } from '@playwright/test'
import { advanceBy, layout, ready, startGame, state } from '../helpers/game'

const OUT =
  '/private/tmp/claude-501/-Users-ishidakanade-development/75d121cc-7eeb-40a2-ada9-1ae0598a03a9/scratchpad/shots'

const SIZES = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 360, h: 400 },
]

for (const s of SIZES) {
  test(`viewport ${s.w}x${s.h}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto('./?frozen=1&seed=12345')
    await ready(page)
    await page.screenshot({ path: `${OUT}/${s.w}x${s.h}-title.png` })
    await startGame(page)
    await advanceBy(page, 12000)
    await page.screenshot({ path: `${OUT}/${s.w}x${s.h}-play.png` })
    const l = await layout(page)
    const st = await state(page)
    const canvasBox = await page.locator('#game').boundingBox()
    console.log(`### ${s.w}x${s.h} layout=${JSON.stringify(l)}`)
    console.log(
      `### ${s.w}x${s.h} canvas=${JSON.stringify(canvasBox)} phase=${st.phase} bombs=${st.bombs.length}`
    )
    // ゾーンが論理画面に収まっているか
    for (const z of l.zones) {
      expect(z.rect.x, `${s.w}x${s.h} zone ${z.kind} x`).toBeGreaterThanOrEqual(0)
      expect(z.rect.x + z.rect.w, `${s.w}x${s.h} zone ${z.kind} right`).toBeLessThanOrEqual(
        l.logicalW + 0.01
      )
      expect(z.rect.y + z.rect.h, `${s.w}x${s.h} zone ${z.kind} bottom`).toBeLessThanOrEqual(
        l.logicalH + 0.01
      )
      expect(z.rect.w, `${s.w}x${s.h} zone ${z.kind} w`).toBeGreaterThan(60)
    }
    // フィールドとゾーンが重なっていないか
    expect(l.field.y + l.field.h, `${s.w}x${s.h} field/zone overlap`).toBeLessThanOrEqual(
      l.zones[0]!.rect.y + 0.01
    )
    // HUD とフィールドが重なっていないか
    expect(l.hud.y + l.hud.h, `${s.w}x${s.h} hud/field overlap`).toBeLessThanOrEqual(
      l.field.y + 0.01
    )
    expect(errors, `${s.w}x${s.h} pageerror`).toEqual([])
    // レターボックス量
    const fitScale = Math.min(s.w / 360, s.h / l.logicalH)
    console.log(
      `### ${s.w}x${s.h} scale=${fitScale.toFixed(3)} letterboxX=${((s.w - 360 * fitScale) / 2).toFixed(1)} letterboxY=${((s.h - l.logicalH * fitScale) / 2).toFixed(1)}`
    )
  })
}
