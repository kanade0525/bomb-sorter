import { test, expect } from '@playwright/test'
import {
  advance,
  advanceBy,
  fitOf,
  layout,
  ready,
  startGame,
  state,
  toClient,
} from '../helpers/game'

test('4. 300 秒相当の長時間プレイ', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  await page.goto('./?frozen=1&seed=20260825')
  await ready(page)
  await startGame(page)

  const result = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    let maxBombs = 0
    let deaths = 0
    let maxScore = 0
    let badScore: string | null = null
    let maxTime = 0
    // 300 秒ぶん = 18750 フレーム
    for (let i = 0; i < 18750; i++) {
      h.advance(16)
      const s = h.getState()
      if (s.bombs.length > maxBombs) maxBombs = s.bombs.length
      if (!Number.isFinite(s.score) || Number.isNaN(s.score))
        badScore = `score=${s.score} at frame ${i}`
      if (!Number.isFinite(s.time)) badScore = `time=${s.time} at frame ${i}`
      if (s.score > maxScore) maxScore = s.score
      if (s.time > maxTime) maxTime = s.time
      if (s.phase === 'gameover') {
        deaths++
        h.command('restart')
      }
    }
    const s = h.getState()
    return {
      maxBombs,
      deaths,
      maxScore,
      badScore,
      maxTime,
      phase: s.phase,
      score: s.score,
      time: s.time,
      bombs: s.bombs.length,
      effects: s.effects.length,
      nextId: s.nextId,
    }
  })
  console.log(`### 300s 結果: ${JSON.stringify(result)}`)
  expect(result.badScore, 'スコア/時間が NaN や Infinity').toBeNull()
  expect(result.maxBombs, 'ボム数が上限 8 を超えた').toBeLessThanOrEqual(8)
  expect(errors, 'pageerror').toEqual([])
  console.log(`### console.error: ${JSON.stringify(consoleErrors)}`)
})

test('4b. 死なずに 300 秒 + メモリ', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./?frozen=1&seed=4242')
  await ready(page)
  await startGame(page)

  const before = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)
  // 死んだら即 restart で 300 秒回す。導火線を無限に伸ばせないので死んでは生き返る形
  const r = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    let restarts = 0
    let fxOverflow = 0
    for (let i = 0; i < 18750; i++) {
      h.advance(16)
      const s = h.getState()
      if (s.effects.length > 200) fxOverflow = Math.max(fxOverflow, s.effects.length)
      if (s.phase === 'gameover') {
        h.command('restart')
        restarts++
      }
    }
    const s = h.getState()
    return { restarts, fxOverflow, nextId: s.nextId, bombs: s.bombs.length }
  })
  await page.evaluate(() => {
    if ((window as any).gc) (window as any).gc()
  })
  const after = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)
  console.log(`### ${JSON.stringify(r)}`)
  console.log(
    `### JS ヒープ: before=${before} after=${after} 差分=${before && after ? ((after - before) / 1024 / 1024).toFixed(2) + 'MB' : '取得不可'}`
  )
  expect(errors).toEqual([])
})

test('5. フレームレート（frozen なし）', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./')
  await ready(page)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.waitForTimeout(2500)
  const s1 = await state(page)
  console.log(
    `### 計測開始 phase=${s1.phase} bombs=${s1.bombs.length} dpr=${await page.evaluate(() => devicePixelRatio)}`
  )

  const measure = async (label: string) => {
    const r = await page.evaluate(
      () =>
        new Promise<{ frames: number; ms: number; worst: number; p95: number; over20: number }>(
          (res) => {
            const gaps: number[] = []
            let prev = performance.now()
            const t0 = prev
            const tick = (t: number) => {
              gaps.push(t - prev)
              prev = t
              if (t - t0 < 5000) requestAnimationFrame(tick)
              else {
                const sorted = [...gaps].sort((a, b) => a - b)
                res({
                  frames: gaps.length,
                  ms: t - t0,
                  worst: Math.max(...gaps),
                  p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
                  over20: gaps.filter((g) => g > 20).length,
                })
              }
            }
            requestAnimationFrame(tick)
          }
        )
    )
    const fps = (r.frames / (r.ms / 1000)).toFixed(1)
    console.log(
      `### ${label}: fps=${fps} frames=${r.frames} 最悪=${r.worst.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms 20ms超=${r.over20}`
    )
    return Number(fps)
  }

  const fpsLight = await measure('ボム少')
  // ボム 8 個の状態を作る（frozen なしなので advance は使えない → 時間経過を待つ）
  // 難易度上昇まで待つと死ぬので、advance でボムを増やしてから rAF を再開する
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    h.freeze()
    for (let i = 0; i < 60 * 60 * 3; i++) {
      h.advance(16)
      if (h.getState().phase === 'gameover') h.command('restart')
      if (h.getState().bombs.length >= 8) break
    }
    h.unfreeze()
  })
  const s2 = await state(page)
  console.log(`### 重い状態 phase=${s2.phase} bombs=${s2.bombs.length}`)
  const fpsHeavy = await measure(`ボム${s2.bombs.length}個`)
  expect(errors).toEqual([])
  expect(fpsLight).toBeGreaterThan(45)
  // ボムが増えても描画コストで落ちないことがこのテストの主眼
  expect(fpsHeavy).toBeGreaterThan(45)
})

test('2b. 掴んだまま画面を縮めて同じ画面座標で離す', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('./?frozen=1&seed=1357')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 2000)
  const canvas = page.locator('#game')
  let l = await layout(page)
  let st = await state(page)
  const bomb = st.bombs[0]!
  let fit = await fitOf(canvas, l.logicalH)
  // フィールド最下部近くまでドラッグ
  const low = { x: bomb.x, y: l.field.y + l.field.h - 30 }
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    buttons: 1,
    ...toClient(fit, bomb),
  })
  await advance(page, 16)
  await canvas.dispatchEvent('pointermove', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    buttons: 1,
    ...toClient(fit, low),
  })
  await advance(page, 16)
  st = await state(page)
  const held = st.bombs.find((b) => b.grabbedBy === 1)!
  const screenPt = toClient(fit, low)
  console.log(
    `### 縮小前: logicalH=${l.logicalH} bomb=(${held.x.toFixed(1)},${held.y.toFixed(1)}) 画面座標=(${screenPt.x.toFixed(1)},${screenPt.y.toFixed(1)}) kind=${held.kind}`
  )

  // ツールバーが出て高さが縮んだ状況
  await page.setViewportSize({ width: 430, height: 500 })
  await page.waitForTimeout(300)
  await advance(page, 16)
  l = await layout(page)
  const fit2 = await fitOf(canvas, l.logicalH)
  // 指は動かしていない = 同じ画面座標。それが新レイアウトで論理どこになるか
  const logicalNow = {
    x: (screenPt.x - fit2.boxX - fit2.offsetX) / fit2.scale,
    y: (screenPt.y - fit2.boxY - fit2.offsetY) / fit2.scale,
  }
  const inZone = l.zones.find(
    (z) =>
      logicalNow.x >= z.rect.x &&
      logicalNow.x <= z.rect.x + z.rect.w &&
      logicalNow.y >= z.rect.y &&
      logicalNow.y <= z.rect.y + z.rect.h
  )
  console.log(
    `### 縮小後: logicalH=${l.logicalH} 同じ画面座標 → 論理(${logicalNow.x.toFixed(1)},${logicalNow.y.toFixed(1)}) ゾーン=${inZone?.kind ?? 'なし'}`
  )
  st = await state(page)
  console.log(`### 縮小後 phase=${st.phase}`)
  // 指を動かさずそのまま離す
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    buttons: 0,
    ...screenPt,
  })
  await advance(page, 16)
  st = await state(page)
  console.log(
    `### 離した後: phase=${st.phase} deathReason=${st.deathReason ?? 'なし'} score=${st.score}`
  )
  expect(errors).toEqual([])
})
