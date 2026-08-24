import { test, expect } from '@playwright/test'
import { ready, state } from '../helpers/game'

const LAZY = `
window.__LAZY__ = (() => {
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
  function tick(th) {
    const s = h.getState(); if (s.phase !== 'playing') { h.advance(16); return }
    const c = s.bombs.filter((b) => b.grabbedBy === null && b.vanish === 0 && b.fuse < th)
    if (!c.length) { h.advance(16); return }
    c.sort((a, b) => a.fuse - b.fuse)
    const b = c[0]; const l = h.getLayout()
    const z = l.zones.find((z) => z.kind === b.kind)
    const t = { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 }
    fire('pointerdown', b, 1); h.advance(16)
    fire('pointermove', t, 1); h.advance(16)
    fire('pointerup', t, 1); h.advance(16)
  }
  return { tick }
})()
`

test('5d. CPU 4 倍スロットリングでボム 8 個の fps', async ({ page, browserName }) => {
  test.setTimeout(240_000)
  test.skip(browserName !== 'chromium', 'CDP スロットリングは Chromium のみ')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.evaluate(LAZY)

  const grow = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    const L = (window as any).__LAZY__
    h.freeze()
    let guard = 0
    while (guard++ < 60000) {
      const s = h.getState()
      if (s.phase === 'gameover') {
        h.command('restart')
        h.advance(16)
        continue
      }
      if (s.bombs.length >= 8) break
      L.tick(0.4)
    }
    const s = h.getState()
    h.unfreeze()
    return { bombs: s.bombs.length, time: s.time, score: s.score }
  })
  console.log(`### 育成: ${JSON.stringify(grow)}`)

  const measure = async (label: string) => {
    const r = await page.evaluate(
      () =>
        new Promise<any>((res) => {
          const gaps: number[] = []
          let prev = performance.now()
          const t0 = prev
          const tick = (t: number) => {
            gaps.push(t - prev)
            prev = t
            if (t - t0 < 5000) requestAnimationFrame(tick)
            else {
              const s = [...gaps].sort((a, b) => a - b)
              res({
                frames: gaps.length,
                ms: t - t0,
                worst: Math.max(...gaps),
                p50: s[Math.floor(s.length * 0.5)],
                p95: s[Math.floor(s.length * 0.95)],
                over20: gaps.filter((g) => g > 20).length,
                over33: gaps.filter((g) => g > 33).length,
                over50: gaps.filter((g) => g > 50).length,
              })
            }
          }
          requestAnimationFrame(tick)
        })
    )
    console.log(
      `### ${label}: fps=${(r.frames / (r.ms / 1000)).toFixed(1)} p50=${r.p50.toFixed(1)} p95=${r.p95.toFixed(1)} 最悪=${r.worst.toFixed(1)}ms >20ms=${r.over20} >33ms=${r.over33} >50ms=${r.over50}`
    )
    return r.frames / (r.ms / 1000)
  }

  const cdp = await page.context().newCDPSession(page)
  for (const rate of [1, 4, 8]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.waitForTimeout(1000)
    const s = await state(page)
    await measure(`CPU ${rate}x 抑制 / ボム${s.bombs.length}個 t=${s.time.toFixed(0)}s`)
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  expect(errors).toEqual([])
})
