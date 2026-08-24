import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  advanceBy,
  fitOf,
  grabOnly,
  layout,
  ready,
  startGame,
  state,
  toClient,
  zoneCenter,
  type Fit,
  type Vec,
} from '../helpers/game'

/**
 * 乱暴な操作でゲームが壊れないかを見る層。
 *
 * 「普通に遊べる」は gameplay.spec.ts が見ているので、ここは
 * 取りこぼした pointerup、指の連打、途中のリサイズ、長時間の連続稼働だけを扱う。
 * どれも実機で実際に起きるが、手で再現するのが面倒な事象。
 */

/** helpers の fire は非公開なので、pointerup だけ手元で組む */
async function up(canvas: Locator, fit: Fit, at: Vec, pointerId = 1): Promise<void> {
  const p = toClient(fit, at)
  await canvas.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    clientX: p.x,
    clientY: p.y,
    buttons: 0,
  })
}

/** ページ内の例外を集める。1 件でもあれば失敗にする */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

/** ボムが n 個以上になるまで進める（導火線で死ぬ前に届く範囲で待つ） */
async function waitForBombs(page: Page, n: number): Promise<void> {
  await page.waitForFunction((want) => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 400; i++) {
      const s = h.getState()
      if (s.phase !== 'playing') return false
      if (s.bombs.filter((b) => b.vanish === 0).length >= want) return true
      h.advance(16)
    }
    return false
  }, n)
}

test('同じ座標に pointerdown を 20 連打しても例外が出ず、掴みが増え続けない', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bomb = (await state(page)).bombs[0]!
  const at = { x: bomb.x, y: bomb.y }

  for (let i = 0; i < 20; i++) {
    await grabOnly(canvas, fit, at, 1)
  }
  await advanceBy(page, 100)

  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.bombs.filter((b) => b.grabbedBy !== null).length).toBeLessThanOrEqual(2)
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])

  // 指を離せば掴まれたままのボムは残らない
  await up(canvas, fit, at, 1)
  await advanceBy(page, 100)
  const after = await state(page)
  expect(after.bombs.filter((b) => b.grabbedBy !== null)).toEqual([])
})

test('5 本指を同時に置いても掴まれるのは 2 個まで', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)
  await waitForBombs(page, 3)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bombs = (await state(page)).bombs.filter((b) => b.vanish === 0)
  expect(bombs.length).toBeGreaterThanOrEqual(3)

  // 5 本の指をそれぞれ別のボムへ（足りない分は先頭のボムを重ねて触る）
  for (let i = 0; i < 5; i++) {
    const b = bombs[i % bombs.length]!
    await grabOnly(canvas, fit, { x: b.x, y: b.y }, i + 1)
  }
  await advanceBy(page, 100)

  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.bombs.filter((b) => b.grabbedBy !== null).length).toBe(2)
  // 掴まれた 2 個は別のボムであること（同じボムを 2 本で掴めない）
  const ids = s.bombs.filter((b) => b.grabbedBy !== null).map((b) => b.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])

  // 5 本すべて離す。取り残しが出ないこと
  for (let i = 0; i < 5; i++) {
    const b = bombs[i % bombs.length]!
    await up(canvas, fit, { x: b.x, y: b.y }, i + 1)
  }
  await advanceBy(page, 100)
  expect((await state(page)).bombs.filter((b) => b.grabbedBy !== null)).toEqual([])
})

test('pointerup を取りこぼしたまま次の pointerdown が来ても掴みが残らない', async ({ page }) => {
  // マウスの多ボタン押しや、指が画面外へ抜けたときに実際に起きる並び。
  // 1 本の指が 2 個のボムを掴んでしまうと、2 個目は離せず触れなくなり
  // 「触っていないボムが勝手に時間切れで死ぬ」理不尽になる
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)
  await waitForBombs(page, 2)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bombs = (await state(page)).bombs.filter((b) => b.vanish === 0)
  const a = bombs[0]!
  const b = bombs[1]!

  await grabOnly(canvas, fit, { x: a.x, y: a.y }, 1)
  await advanceBy(page, 100)
  await grabOnly(canvas, fit, { x: b.x, y: b.y }, 1) // pointerup なしで次の down
  await advanceBy(page, 100)

  const mid = await state(page)
  expect(mid.bombs.filter((x) => x.grabbedBy === 1).length).toBe(1)

  await up(canvas, fit, { x: l.field.x + 40, y: l.field.y + 40 }, 1)
  await advanceBy(page, 100)
  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.bombs.filter((x) => x.grabbedBy !== null)).toEqual([])
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})

test('ドラッグ中に画面の大きさが変わってから離しても爆死しない', async ({ page }) => {
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)

  const canvas = page.locator('canvas#game')
  const l0 = await layout(page)
  const fit0 = await fitOf(canvas, l0.logicalH)
  const bomb = (await state(page)).bombs[0]!

  await grabOnly(canvas, fit0, { x: bomb.x, y: bomb.y }, 1)
  await advanceBy(page, 100)
  expect((await state(page)).bombs.some((b) => b.grabbedBy === 1)).toBe(true)

  // 掴んだまま横向きに近い形へ。relayout は 100ms デバウンスなので待つ
  await page.setViewportSize({ width: 740, height: 420 })
  await page.waitForTimeout(300)

  const l1 = await layout(page)
  const fit1 = await fitOf(canvas, l1.logicalH)
  // 新しいレイアウトのフィールド中央（どのゾーンでもない場所）で離す
  const drop = { x: l1.field.x + l1.field.w / 2, y: l1.field.y + l1.field.h / 2 }
  await up(canvas, fit1, drop, 1)
  await advanceBy(page, 100)

  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.score).toBe(0)
  expect(s.bombs.filter((b) => b.grabbedBy !== null)).toEqual([])

  // 数フレーム進めれば、全ボムが新しいフィールドの内側に収まっている
  await advanceBy(page, 500)
  const s2 = await state(page)
  const l2 = await layout(page)
  for (const b of s2.bombs) {
    if (b.grabbedBy !== null || b.vanish > 0) continue
    expect(b.x).toBeGreaterThanOrEqual(l2.field.x - 1)
    expect(b.x).toBeLessThanOrEqual(l2.field.x + l2.field.w + 1)
    expect(b.y).toBeGreaterThanOrEqual(l2.field.y - 1)
    expect(b.y).toBeLessThanOrEqual(l2.field.y + l2.field.h + 1)
  }
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})

test('リサイズを挟んでも仕分けの判定が新しい座標系で成立する', async ({ page }) => {
  // 判定用と描画用で座標系が二重化していたら、ここでずれて誤爆する
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)

  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(300)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l.logicalH)
  const bomb = (await state(page)).bombs.filter((b) => b.vanish === 0)[0]!

  await grabOnly(canvas, fit, { x: bomb.x, y: bomb.y }, 1)
  await advanceBy(page, 100)
  await up(canvas, fit, zoneCenter(l, bomb.kind), 1)
  await advanceBy(page, 100)

  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(s.sorted).toBe(1)
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})

test('300 秒相当を回しても例外が出ず、数値が壊れない', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)

  // 死んだら restart で繋いで回し続ける。advance は 1 回で最大 5 ステップ進む
  const result = await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    let steps = 0
    let deaths = 0
    let maxScore = 0
    let bad: string | null = null
    for (let i = 0; i < 3600; i++) {
      h.advance(100)
      steps += 5
      const s = h.getState()
      maxScore = Math.max(maxScore, s.score)
      const nums: number[] = [s.score, s.time, s.combo, s.comboTimer, s.spawnTimer]
      for (const b of s.bombs) nums.push(b.x, b.y, b.vx, b.vy, b.fuse, b.vanish)
      if (bad === null && nums.some((n) => !Number.isFinite(n))) {
        bad = `${i} 回目に有限でない値: ${JSON.stringify(s)}`
      }
      if (s.phase === 'gameover') {
        deaths++
        h.command('restart')
      }
    }
    const s = h.getState()
    return { steps, deaths, maxScore, bad, phase: s.phase, bombs: s.bombs.length, score: s.score }
  })

  // 1 ステップ = 1/60 秒なので 18000 ステップで 300 秒
  expect(result.steps).toBe(18_000)
  expect(result.bad).toBeNull()
  expect(result.deaths).toBeGreaterThan(5)
  expect(Number.isFinite(result.score)).toBe(true)
  expect(Number.isSafeInteger(result.maxScore)).toBe(true)
  expect(result.bombs).toBeLessThanOrEqual(16)
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})

test('タイトル画面で 300 秒放置してもボムが飛び散らない', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)

  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 3600; i++) h.advance(100)
  })

  const s = await state(page)
  const l = await layout(page)
  expect(s.phase).toBe('title')
  for (const b of s.bombs) {
    expect(b.x).toBeGreaterThanOrEqual(l.field.x - 1)
    expect(b.x).toBeLessThanOrEqual(l.field.x + l.field.w + 1)
    expect(b.y).toBeGreaterThanOrEqual(l.field.y - 1)
    expect(b.y).toBeLessThanOrEqual(l.field.y + l.field.h + 1)
    expect(Number.isFinite(b.wobble)).toBe(true)
  }
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})

test('ポーズと再開を連打しても状態が壊れない', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)
  const t0 = (await state(page)).time

  // 連打はフックから送る。ボタン経由だと DOM 更新の待ちで連打にならない
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 10; i++) {
      h.command('pause')
      h.command('pause')
      h.command('resume')
      h.command('resume')
    }
  })
  const mid = await state(page)
  expect(mid.phase).toBe('ready')
  // ポーズ中に時間が進んでいないこと
  expect(mid.time).toBe(t0)

  await advanceBy(page, 2000)
  const s = await state(page)
  expect(s.phase).toBe('playing')
  expect(Number.isFinite(s.time)).toBe(true)
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})

test('ボタンからのポーズと再開を往復しても playing に戻れる', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./?seed=2024&frozen=1')
  await ready(page)
  await startGame(page)

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '一時停止' }).click()
    await advanceBy(page, 100)
    expect((await state(page)).phase).toBe('paused')
    await page.getByRole('button', { name: 'つづける' }).click()
    await advanceBy(page, 2000)
    expect((await state(page)).phase).toBe('playing')
  }
  expect(errors, `例外:\n${errors.join('\n')}`).toEqual([])
})
