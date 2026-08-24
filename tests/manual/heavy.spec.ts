import { test, expect } from '@playwright/test'
import { ready } from '../helpers/game'

/** ぎりぎりまで放置してボムを溜める「なまけ者」プレイヤー */
const LAZY = `
window.__LAZY__ = (() => {
  const canvas = document.querySelector('#game')
  const h = window.__BOMB_SORTER__
  function toClient(p) {
    const l = h.getLayout()
    const r = canvas.getBoundingClientRect()
    const scale = Math.min(r.width / l.logicalW, r.height / l.logicalH)
    return {
      clientX: r.x + (r.width - l.logicalW * scale) / 2 + p.x * scale,
      clientY: r.y + (r.height - l.logicalH * scale) / 2 + p.y * scale,
    }
  }
  function fire(type, p, pointerId) {
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'touch', isPrimary: true, bubbles: true,
      buttons: type === 'pointerup' ? 0 : 1, ...toClient(p),
    }))
  }
  /** 導火線が threshold 秒を切ったボムだけ救出する。1 フレーム分進める */
  function tick(threshold) {
    const s = h.getState()
    if (s.phase !== 'playing') return
    const cand = s.bombs.filter((b) => b.grabbedBy === null && b.vanish === 0 && b.fuse < threshold)
    if (cand.length === 0) { h.advance(16); return }
    cand.sort((a, b) => a.fuse - b.fuse)
    const b = cand[0]
    const l = h.getLayout()
    const z = l.zones.find((z) => z.kind === b.kind)
    const target = { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 }
    fire('pointerdown', b, 1)
    h.advance(16)
    fire('pointermove', target, 1)
    h.advance(16)
    fire('pointerup', target, 1)
    h.advance(16)
  }
  return { tick, fire }
})()
`

test('4d. なまけ者プレイでボムを 8 個まで溜め、300 秒回す', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  await page.goto('./?frozen=1&seed=8888')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.evaluate(LAZY)
  const before = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)

  const r = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    const L = (window as any).__LAZY__
    let maxBombs = 0,
      maxTime = 0,
      maxScore = 0,
      deaths = 0,
      maxFx = 0
    const bad: string[] = []
    const hist: Record<number, number> = {}
    // 300 秒ぶんの実時間。tick は 1〜3 フレーム進むので time で管理する
    let guard = 0
    while (h.getState().time < 300 && guard < 400000) {
      guard++
      const s = h.getState()
      if (s.phase === 'gameover') {
        deaths++
        h.command('restart')
        h.advance(16)
        continue
      }
      if (s.phase !== 'playing') {
        h.advance(16)
        continue
      }
      if (s.bombs.length > maxBombs) maxBombs = s.bombs.length
      hist[s.bombs.length] = (hist[s.bombs.length] ?? 0) + 1
      if (s.time > maxTime) maxTime = s.time
      if (s.score > maxScore) maxScore = s.score
      if (s.effects.length > maxFx) maxFx = s.effects.length
      if (!Number.isFinite(s.score)) bad.push('score ' + s.score)
      if (!Number.isFinite(s.time)) bad.push('time ' + s.time)
      for (const b of s.bombs)
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.fuse))
          bad.push('bomb NaN t=' + s.time)
      L.tick(1.6)
    }
    const s = h.getState()
    return {
      maxBombs,
      maxTime,
      maxScore,
      deaths,
      maxFx,
      guard,
      bad: bad.slice(0, 5),
      badCount: bad.length,
      hist,
      phase: s.phase,
      score: s.score,
      sorted: s.sorted,
      nextId: s.nextId,
      bombs: s.bombs.length,
      time: s.time,
    }
  })
  const after = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)
  console.log(`### なまけ者 300s: ${JSON.stringify(r)}`)
  console.log(`### JS ヒープ before=${before} after=${after}`)
  console.log(`### console.error=${JSON.stringify(consoleErrors)}`)
  expect(r.badCount, JSON.stringify(r.bad)).toBe(0)
  expect(r.maxBombs, 'ALIVE_CAP=8 を超えた').toBeLessThanOrEqual(8)
  expect(errors).toEqual([])
})

test('5c. ボム 8 個の実描画 fps とスクリーンショット', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.evaluate(LAZY)
  console.log(`### dpr=${await page.evaluate(() => devicePixelRatio)}`)

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
              })
            }
          }
          requestAnimationFrame(tick)
        })
    )
    console.log(
      `### ${label}: fps=${(r.frames / (r.ms / 1000)).toFixed(1)} p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms 最悪=${r.worst.toFixed(1)}ms >20ms=${r.over20} >33ms=${r.over33}`
    )
    return r.frames / (r.ms / 1000)
  }

  await page.waitForTimeout(2000)
  const light = await measure('序盤（ボム 3 個）')

  const grow = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    const L = (window as any).__LAZY__
    h.freeze()
    let max = 0,
      guard = 0
    while (guard < 60000) {
      guard++
      const s = h.getState()
      if (s.phase === 'gameover') {
        h.command('restart')
        h.advance(16)
        continue
      }
      if (s.bombs.length > max) max = s.bombs.length
      if (s.bombs.length >= 8) break
      L.tick(0.4)
    }
    const s = h.getState()
    h.unfreeze()
    return { max, bombs: s.bombs.length, time: s.time, score: s.score, phase: s.phase }
  })
  console.log(`### 育成結果: ${JSON.stringify(grow)}`)
  await page.screenshot({
    path: '/private/tmp/claude-501/-Users-ishidakanade-development/75d121cc-7eeb-40a2-ada9-1ae0598a03a9/scratchpad/shots/heavy-8bombs.png',
  })
  const heavy = await measure(`ボム${grow.bombs}個 t=${grow.time.toFixed(0)}s score=${grow.score}`)
  expect(errors).toEqual([])
  expect(light, '序盤 fps').toBeGreaterThan(45)
  expect(heavy, '高負荷 fps').toBeGreaterThan(45)
})
