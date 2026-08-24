import { test, expect } from '@playwright/test'
import { ready } from '../helpers/game'

const AUTO = `
window.__AUTO__ = (() => {
  const canvas = document.querySelector('#game')
  const h = window.__BOMB_SORTER__
  function toClient(p) {
    const l = h.getLayout(); const r = canvas.getBoundingClientRect()
    const scale = Math.min(r.width / l.logicalW, r.height / l.logicalH)
    return { clientX: r.x + (r.width - l.logicalW * scale) / 2 + p.x * scale,
             clientY: r.y + (r.height - l.logicalH * scale) / 2 + p.y * scale }
  }
  function fire(type, p, id) {
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true,
      bubbles: true, buttons: type === 'pointerup' ? 0 : 1, ...toClient(p) }))
  }
  function play() {
    const s = h.getState(); if (s.phase !== 'playing') return false
    const c = s.bombs.filter((b) => b.grabbedBy === null && b.vanish === 0)
    if (!c.length) { h.advance(16); return true }
    c.sort((a, b) => a.fuse - b.fuse)
    const b = c[0]; const l = h.getLayout()
    const z = l.zones.find((z) => z.kind === b.kind)
    const t = { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 }
    fire('pointerdown', b, 1); h.advance(16)
    fire('pointermove', t, 1); h.advance(16)
    fire('pointerup', t, 1); h.advance(16)
    return true
  }
  return { play }
})()
`

const SIZES = [
  { w: 360, h: 640 },
  { w: 320, h: 568 },
]

for (const s of SIZES) {
  test(`HUD 桁あふれ ${s.w}x${s.h}`, async ({ page }) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto('./?frozen=1&seed=31337')
    await ready(page)
    await page.getByRole('button', { name: 'はじめる' }).click()
    await page.evaluate(AUTO)
    const r = await page.evaluate(() => {
      const h = window.__BOMB_SORTER__!
      const A = (window as any).__AUTO__
      let guard = 0
      while (guard++ < 40000) {
        const st = h.getState()
        if (st.phase === 'gameover') {
          h.command('restart')
          h.advance(16)
          continue
        }
        if (st.phase !== 'playing') {
          h.advance(16)
          continue
        }
        if (st.score >= 1_000_000 && st.combo >= 100) break
        A.play()
      }
      const st = h.getState()
      return {
        score: st.score,
        combo: st.combo,
        best: st.bestCombo,
        time: st.time,
        phase: st.phase,
        guard,
      }
    })
    console.log(`### ${s.w}x${s.h} 到達: ${JSON.stringify(r)}`)
    await page.screenshot({
      path: `/private/tmp/claude-501/-Users-ishidakanade-development/75d121cc-7eeb-40a2-ada9-1ae0598a03a9/scratchpad/shots/hud-${s.w}x${s.h}-score${r.score}.png`,
    })
    // HUD の文字幅を実測して重なりを判定する。
    // フォントと配置は src/view/draw-hud.ts と揃えること
    // （揃っていないと「直したのに重なっている」と嘘の報告をしてしまう。一度やった）
    const overlap = await page.evaluate(() => {
      const h = window.__BOMB_SORTER__!
      const st = h.getState()
      const l = h.getLayout()
      const c = document.createElement('canvas').getContext('2d')!

      const text = String(st.score)
      const scoreSize = text.length > 7 ? 20 : text.length > 5 ? 24 : 28
      c.font = `700 ${scoreSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
      const scoreW = c.measureText(text).width
      const scoreRight = l.hud.x + scoreW

      // 右端は DOM のボタンのために 116 論理px 空けてある
      const RESERVED = 116
      const right = l.hud.x + l.hud.w - RESERVED
      c.font = '700 14px system-ui, -apple-system, "Hiragino Sans", sans-serif'
      const comboW = c.measureText(`${st.combo} れんさ  x5.0`).width
      const comboLeft = right - comboW

      // ボタンの実際の位置も測って、Canvas の文字が潜っていないか見る
      const btn = document.querySelector('#btn-mute')!.getBoundingClientRect()
      const canvas = document.querySelector('#game')!.getBoundingClientRect()
      const scale = Math.min(canvas.width / l.logicalW, canvas.height / l.logicalH)
      const offsetX = (canvas.width - l.logicalW * scale) / 2
      const btnLeftLogical = (btn.x - canvas.x - offsetX) / scale

      return {
        score: st.score,
        combo: st.combo,
        scoreSize,
        scoreRight,
        comboLeft,
        comboRight: right,
        btnLeftLogical,
        overlapPx: scoreRight - comboLeft,
        buttonOverlapPx: right - btnLeftLogical,
      }
    })
    console.log(`### ${s.w}x${s.h} 文字幅: ${JSON.stringify(overlap)}`)
    console.log(
      `### ${s.w}x${s.h} スコア右端=${overlap.scoreRight.toFixed(1)} / コンボ左端=${overlap.comboLeft.toFixed(1)} → ${overlap.overlapPx > 0 ? `${overlap.overlapPx.toFixed(1)}px 重なり` : '重なりなし'}`
    )
    console.log(
      `### ${s.w}x${s.h} コンボ右端=${overlap.comboRight.toFixed(1)} / ボタン左端=${overlap.btnLeftLogical.toFixed(1)} → ${overlap.buttonOverlapPx > 0 ? `${overlap.buttonOverlapPx.toFixed(1)}px ボタンに潜る` : 'ボタンと干渉なし'}`
    )
    expect(errors).toEqual([])
    expect(overlap.overlapPx, 'スコアとコンボが重なっている').toBeLessThan(0)
    expect(overlap.buttonOverlapPx, 'コンボが上部のボタンに潜っている').toBeLessThan(0)
  })
}
