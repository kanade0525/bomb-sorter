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

test('6. Service Worker 登録後にオフラインでリロード', async ({ page, context, browserName }) => {
  test.setTimeout(120_000)
  test.skip(browserName !== 'chromium', 'SW のオフライン検証は Chromium で行う')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`))

  await page.goto('./')
  await ready(page)
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready
    return { scope: r.scope, active: r.active?.state ?? null, script: r.active?.scriptURL ?? null }
  })
  console.log(`### SW 登録: ${JSON.stringify(reg)}`)
  // プリキャッシュが終わるのを待つ
  await page.waitForTimeout(3000)
  const cacheInfo = await page.evaluate(async () => {
    const names = await caches.keys()
    const out: Record<string, number> = {}
    for (const n of names) out[n] = (await (await caches.open(n)).keys()).length
    return out
  })
  console.log(`### キャッシュ: ${JSON.stringify(cacheInfo)}`)

  await context.setOffline(true)
  failed.length = 0
  const resp = await page.reload({ waitUntil: 'load' })
  console.log(`### オフライン reload: status=${resp?.status()} ok=${resp?.ok()}`)
  await ready(page)
  const st = await state(page)
  console.log(`### オフライン起動: phase=${st.phase} bombs=${st.bombs.length}`)
  const startBtn = page.getByRole('button', { name: 'ゲーム開始' })
  await expect(startBtn).toBeVisible()
  await startBtn.click()
  await page.waitForTimeout(2500)
  const st2 = await state(page)
  console.log(`### オフラインで開始: phase=${st2.phase} bombs=${st2.bombs.length}`)
  await page.screenshot({
    path: '/private/tmp/claude-501/-Users-ishidakanade-development/75d121cc-7eeb-40a2-ada9-1ae0598a03a9/scratchpad/shots/offline-play.png',
  })
  console.log(`### 失敗したリクエスト: ${JSON.stringify(failed)}`)
  expect(st2.phase === 'playing' || st2.phase === 'ready').toBe(true)
  expect(errors).toEqual([])
  await context.setOffline(false)
})

test('2b. 掴んだまま画面を縮めて、指を動かさずに離す', async ({ page }) => {
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
  const fit = await fitOf(canvas, l)
  const low = { x: bomb.x, y: l.field.y + l.field.h - 30 }
  const ev = (p: { x: number; y: number }, buttons: number) => ({
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    buttons,
    clientX: p.x,
    clientY: p.y,
  })
  await canvas.dispatchEvent('pointerdown', ev(toClient(fit, bomb), 1))
  await advance(page, 16)
  await canvas.dispatchEvent('pointermove', ev(toClient(fit, low), 1))
  await advance(page, 16)
  st = await state(page)
  const held = st.bombs.find((b) => b.grabbedBy === 1)
  const screenPt = toClient(fit, low)
  console.log(
    `### 縮小前 logicalH=${l.logicalH} held=${held ? `(${held.x.toFixed(1)},${held.y.toFixed(1)}) kind=${held.kind}` : 'なし'} 画面座標=(${screenPt.x.toFixed(1)},${screenPt.y.toFixed(1)})`
  )
  console.log(`### 縮小前 zones=${JSON.stringify(l.zones.map((z) => ({ k: z.kind, ...z.rect })))}`)

  await page.setViewportSize({ width: 430, height: 500 })
  await page.waitForTimeout(300)
  await advance(page, 16)
  l = await layout(page)
  const fit2 = await fitOf(canvas, l)
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
  st = await state(page)
  const held2 = st.bombs.find((b) => b.grabbedBy === 1)
  console.log(
    `### 縮小後 logicalH=${l.logicalH} phase=${st.phase} 同一画面座標→論理(${logicalNow.x.toFixed(1)},${logicalNow.y.toFixed(1)}) その位置のゾーン=${inZone?.kind ?? 'なし'}`
  )
  console.log(
    `### 縮小後 掴んでいるボム=${held2 ? `(${held2.x.toFixed(1)},${held2.y.toFixed(1)}) kind=${held2.kind}` : 'なし'}`
  )

  await canvas.dispatchEvent('pointerup', ev(screenPt, 0))
  await advance(page, 16)
  st = await state(page)
  console.log(
    `### 指を動かさず離した結果: phase=${st.phase} deathReason=${st.deathReason ?? 'なし'} score=${st.score}`
  )
  expect(errors).toEqual([])
})
