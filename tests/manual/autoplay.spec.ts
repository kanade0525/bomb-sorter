import { test, expect } from '@playwright/test'
import { ready } from '../helpers/game'

/** ページ内に「勝手に上手に遊ぶ人」を注入する。frozen 前提 */
const AUTOPLAYER = `
window.__AUTO__ = (() => {
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
  /** 1 手だけ打つ: 導火線が一番短いボムを正しいゾーンへ運ぶ */
  function play() {
    const s = h.getState()
    if (s.phase !== 'playing') return false
    const cand = s.bombs.filter((b) => b.grabbedBy === null && b.vanish === 0)
    if (cand.length === 0) return false
    cand.sort((a, b) => a.fuse - b.fuse)
    const b = cand[0]
    const l = h.getLayout()
    const z = l.zones.find((z) => z.kind === b.kind)
    const target = { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 }
    fire('pointerdown', b, 1)
    h.advance(16)
    // 数ステップで運ぶ（掴んだ後のオフセットを考慮して素直に指を動かす）
    for (let i = 1; i <= 4; i++) {
      fire('pointermove', { x: b.x + (target.x - b.x) * i / 4, y: b.y + (target.y - b.y) * i / 4 }, 1)
      h.advance(16)
    }
    fire('pointerup', target, 1)
    h.advance(16)
    return true
  }
  return { play, fire }
})()
`

test('4c. 自動プレイで 300 秒（実際に難易度が上がる状態）', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  await page.goto('./?frozen=1&seed=20260825')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.evaluate(AUTOPLAYER)
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 120; i++) h.advance(16)
  })

  const before = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)

  const r = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    const A = (window as any).__AUTO__
    let elapsed = 0
    let maxBombs = 0,
      maxTime = 0,
      maxScore = 0,
      deaths = 0,
      maxCombo = 0
    let bad: string[] = []
    let maxFx = 0
    while (elapsed < 300_000) {
      const s = h.getState()
      if (s.phase === 'gameover') {
        deaths++
        h.command('restart')
        h.advance(16)
        elapsed += 16
        continue
      }
      if (s.phase !== 'playing') {
        h.advance(16)
        elapsed += 16
        continue
      }
      if (s.bombs.length > maxBombs) maxBombs = s.bombs.length
      if (s.time > maxTime) maxTime = s.time
      if (s.score > maxScore) maxScore = s.score
      if (s.bestCombo > maxCombo) maxCombo = s.bestCombo
      if (s.effects.length > maxFx) maxFx = s.effects.length
      if (!Number.isFinite(s.score)) bad.push(`score=${s.score} t=${s.time}`)
      if (!Number.isFinite(s.time)) bad.push(`time=${s.time}`)
      if (!Number.isFinite(s.combo)) bad.push(`combo=${s.combo}`)
      for (const b of s.bombs) {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) bad.push(`bomb pos NaN t=${s.time}`)
        if (!Number.isFinite(b.fuse)) bad.push(`fuse NaN t=${s.time}`)
      }
      const before = elapsed
      if (!A.play()) {
        h.advance(16)
        elapsed += 16
      } else {
        elapsed += 16 * 6
      }
      if (elapsed === before) {
        h.advance(16)
        elapsed += 16
      }
    }
    const s = h.getState()
    return {
      maxBombs,
      maxTime,
      maxScore,
      deaths,
      maxCombo,
      maxFx,
      bad: bad.slice(0, 5),
      badCount: bad.length,
      phase: s.phase,
      score: s.score,
      sorted: s.sorted,
      nextId: s.nextId,
      bombs: s.bombs.length,
    }
  })
  const after = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)
  console.log(`### 自動プレイ 300s: ${JSON.stringify(r)}`)
  console.log(`### JS ヒープ: before=${before} after=${after}`)
  console.log(`### console.error=${JSON.stringify(consoleErrors)}`)
  expect(r.badCount, `NaN/Infinity: ${JSON.stringify(r.bad)}`).toBe(0)
  expect(r.maxBombs, 'ボム上限 8').toBeLessThanOrEqual(8)
  expect(r.maxTime, '300 秒到達したか（連続でなくても最長プレイ時間）').toBeGreaterThan(60)
  expect(errors).toEqual([])
})

test('5b. ボム 8 個での実描画 fps', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.evaluate(AUTOPLAYER)
  const dpr = await page.evaluate(() => devicePixelRatio)

  const measure = async (label: string) => {
    const r = await page.evaluate(
      () =>
        new Promise<{
          frames: number
          ms: number
          worst: number
          p95: number
          over20: number
          over33: number
        }>((res) => {
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
                p95: s[Math.floor(s.length * 0.95)] ?? 0,
                over20: gaps.filter((g) => g > 20).length,
                over33: gaps.filter((g) => g > 33).length,
              })
            }
          }
          requestAnimationFrame(tick)
        })
    )
    console.log(
      `### ${label}: fps=${(r.frames / (r.ms / 1000)).toFixed(1)} 最悪=${r.worst.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms >20ms=${r.over20} >33ms=${r.over33}`
    )
    return r.frames / (r.ms / 1000)
  }

  await page.waitForTimeout(2000)
  console.log(`### dpr=${dpr}`)
  const light = await measure('序盤')

  // 自動プレイで進めてボムを 8 個まで持っていく
  const grow = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    const A = (window as any).__AUTO__
    h.freeze()
    let max = 0,
      frames = 0
    while (frames < 60 * 60 * 6) {
      const s = h.getState()
      if (s.phase === 'gameover') {
        h.command('restart')
        h.advance(16)
        frames++
        continue
      }
      if (s.bombs.length > max) max = s.bombs.length
      if (s.bombs.length >= 8) break
      if (!A.play()) {
        h.advance(16)
        frames++
      } else frames += 6
    }
    const s = h.getState()
    h.unfreeze()
    return { max, bombs: s.bombs.length, time: s.time, phase: s.phase, score: s.score }
  })
  console.log(`### 育成結果: ${JSON.stringify(grow)}`)
  const heavy = await measure(`ボム${grow.bombs}個 t=${grow.time.toFixed(0)}s`)
  expect(errors).toEqual([])
  expect(light).toBeGreaterThan(45)
  expect(heavy).toBeGreaterThan(45)
})
