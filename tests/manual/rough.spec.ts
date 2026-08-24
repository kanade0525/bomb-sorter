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
  zoneCenter,
} from '../helpers/game'

type P = { x: number; y: number }

async function fire(
  page: import('@playwright/test').Page,
  type: string,
  p: P,
  pointerId = 1
): Promise<void> {
  await page.locator('#game').dispatchEvent(type, {
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === 1,
    bubbles: true,
    clientX: p.x,
    clientY: p.y,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  })
}

test('2. ドラッグ中にビューポートを変える', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?frozen=1&seed=777')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 2000)

  const canvas = page.locator('#game')
  let l = await layout(page)
  let st = await state(page)
  expect(st.bombs.length).toBeGreaterThan(0)
  const bomb = st.bombs[0]!
  console.log(
    `### before: logicalH=${l.logicalH} bomb=(${bomb.x.toFixed(1)},${bomb.y.toFixed(1)}) kind=${bomb.kind} fuse=${bomb.fuse.toFixed(2)}`
  )

  let fit = await fitOf(canvas, l.logicalH)
  await fire(page, 'pointerdown', toClient(fit, bomb))
  await advance(page, 16)
  st = await state(page)
  const held = st.bombs.find((b) => b.id === bomb.id)!
  console.log(`### grabbed? grabbedBy=${JSON.stringify(held.grabbedBy)} phase=${st.phase}`)
  expect(held.grabbedBy).not.toBeNull()

  // 掴んだまま横向きへ回転（縦→横）
  await page.setViewportSize({ width: 844, height: 390 })
  await page.waitForTimeout(300) // relayout デバウンス 100ms を超えて待つ
  await advance(page, 16)
  l = await layout(page)
  st = await state(page)
  const after = st.bombs.find((b) => b.id === bomb.id)
  console.log(`### after rotate: logicalH=${l.logicalH} phase=${st.phase} bombs=${st.bombs.length}`)
  console.log(
    `### after rotate bomb=${after ? `(${after.x.toFixed(1)},${after.y.toFixed(1)}) grabbedBy=${JSON.stringify(after.grabbedBy)}` : 'なし'}`
  )
  console.log(`### field=${JSON.stringify(l.field)} zones0=${JSON.stringify(l.zones[0]!.rect)}`)
  // 全ボムがフィールド内か
  for (const b of st.bombs) {
    console.log(
      `###   bomb ${b.id} (${b.x.toFixed(1)},${b.y.toFixed(1)}) held=${b.grabbedBy !== null} inField=${b.x >= l.field.x && b.x <= l.field.x + l.field.w && b.y >= l.field.y && b.y <= l.field.y + l.field.h}`
    )
  }
  expect(st.phase, 'ローテーションで爆死してはいけない').toBe('playing')

  // 元の座標のまま指を離す（回転でここはゾーンの上かもしれない）
  fit = await fitOf(canvas, l.logicalH)
  await fire(page, 'pointerup', toClient(fit, { x: bomb.x, y: bomb.y }))
  await advance(page, 16)
  st = await state(page)
  console.log(`### after release: phase=${st.phase} score=${st.score} bombs=${st.bombs.length}`)
  expect(errors).toEqual([])
})

test('3a. 同じ座標に pointerdown 20 連打', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./?frozen=1&seed=555')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 2000)
  const canvas = page.locator('#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const st0 = await state(page)
  const b = st0.bombs[0]!
  for (let i = 0; i < 20; i++) {
    await fire(page, 'pointerdown', toClient(fit, b), 1)
  }
  await advance(page, 16)
  const st = await state(page)
  console.log(`### 20連打後: phase=${st.phase} bombs=${st.bombs.length} score=${st.score}`)
  console.log(`### grabbedBy=${st.bombs.map((x) => JSON.stringify(x.grabbedBy)).join(',')}`)
  expect(st.phase).toBe('playing')
  expect(errors).toEqual([])
  // 掴まれているボムは 1 個以下
  expect(st.bombs.filter((x) => x.grabbedBy !== null).length).toBeLessThanOrEqual(1)
})

test('3b. 5 本指を同時に置く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./?frozen=1&seed=999')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 40000) // ボムを増やす前に死ぬかもしれないので後で見る
  let st = await state(page)
  if (st.phase !== 'playing') {
    await page.evaluate(() => window.__BOMB_SORTER__!.command('restart'))
    await advanceBy(page, 3000)
    st = await state(page)
  }
  const l = await layout(page)
  const canvas = page.locator('#game')
  const fit = await fitOf(canvas, l.logicalH)
  console.log(`### 5本指テスト開始: phase=${st.phase} bombs=${st.bombs.length}`)
  const targets = st.bombs.slice(0, 5)
  for (let i = 0; i < 5; i++) {
    const t = targets[i] ?? { x: 180, y: l.field.y + 40 }
    await fire(page, 'pointerdown', toClient(fit, t), 10 + i)
  }
  await advance(page, 16)
  st = await state(page)
  const heldCount = st.bombs.filter((b) => b.grabbedBy !== null).length
  console.log(
    `### 5本指後: phase=${st.phase} held=${heldCount} activeDrags=${JSON.stringify(st.bombs.map((b) => b.grabbedBy))}`
  )
  expect(heldCount, '同時ドラッグ上限 2 を超えてはいけない').toBeLessThanOrEqual(2)
  // 全部ゾーンへ移動して離す
  const zc = zoneCenter(l, 'round')
  for (let i = 0; i < 5; i++) {
    await fire(page, 'pointermove', toClient(fit, zc), 10 + i)
  }
  await advance(page, 16)
  for (let i = 0; i < 5; i++) {
    await fire(page, 'pointerup', toClient(fit, zc), 10 + i)
  }
  await advance(page, 16)
  st = await state(page)
  console.log(`### 5本指ゾーン投下後: phase=${st.phase} score=${st.score} bombs=${st.bombs.length}`)
  expect(Number.isFinite(st.score)).toBe(true)
  expect(errors).toEqual([])
})

test('3c. move なしで遠くで pointerup', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./?frozen=1&seed=321')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 2000)
  const l = await layout(page)
  const canvas = page.locator('#game')
  const fit = await fitOf(canvas, l.logicalH)
  let st = await state(page)
  const b = st.bombs[0]!
  const wrongZone = zoneCenter(l, b.kind === 'round' ? 'square' : 'round')
  console.log(
    `### bomb kind=${b.kind} at (${b.x.toFixed(1)},${b.y.toFixed(1)}) → 誤ゾーン ${JSON.stringify(wrongZone)} で move なし up`
  )
  await fire(page, 'pointerdown', toClient(fit, b))
  await advance(page, 16)
  await fire(page, 'pointerup', toClient(fit, wrongZone))
  await advance(page, 16)
  st = await state(page)
  console.log(
    `### 結果: phase=${st.phase} deathReason=${st.deathReason ?? 'なし'} score=${st.score}`
  )
  expect(errors).toEqual([])
})

test('3d. pointerup を送らず次の pointerdown', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./?frozen=1&seed=444')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 5000)
  const l = await layout(page)
  const canvas = page.locator('#game')
  const fit = await fitOf(canvas, l.logicalH)
  let st = await state(page)
  console.log(`### bombs=${st.bombs.length}`)
  // pointerId を変えつつ up を送らずに down を繰り返す
  for (let i = 0; i < 6; i++) {
    const b = st.bombs[i % st.bombs.length]!
    await fire(page, 'pointerdown', toClient(fit, b), 100 + i)
    await advance(page, 16)
    st = await state(page)
  }
  const held = st.bombs.filter((b) => b.grabbedBy !== null)
  console.log(
    `### up なし 6連 down 後: phase=${st.phase} held=${held.length} grabbedBy=${JSON.stringify(held.map((b) => b.grabbedBy))}`
  )
  expect(held.length, '同時ドラッグ上限 2').toBeLessThanOrEqual(2)
  // 残ったドラッグが解放されるか（cancel を送る）
  for (let i = 0; i < 6; i++) await fire(page, 'pointercancel', { x: 0, y: 0 }, 100 + i)
  await advance(page, 16)
  st = await state(page)
  console.log(
    `### cancel 後: held=${st.bombs.filter((b) => b.grabbedBy !== null).length} phase=${st.phase}`
  )
  expect(st.bombs.filter((b) => b.grabbedBy !== null).length).toBe(0)
  expect(errors).toEqual([])
})
