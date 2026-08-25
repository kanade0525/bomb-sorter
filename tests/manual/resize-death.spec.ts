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

/**
 * iOS のツールバーが出て高さが縮む状況を再現する。
 * 指は一切動かさないのに、同じ画面座標が新レイアウトではゾーンの中になる。
 */
test('2c. ツールバーが出た瞬間に離すと、指を動かしていないのに誤爆死するか', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const H0 = 932
  const H1 = 832 // ツールバー約 100px ぶん

  for (const attempt of [0, 1, 2, 3, 4, 5]) {
    await page.setViewportSize({ width: 430, height: H0 })
    await page.goto(`./?frozen=1&seed=${1000 + attempt}`)
    await ready(page)
    await startGame(page)
    await advanceBy(page, 1500)
    const canvas = page.locator('#game')
    let l = await layout(page)
    let st = await state(page)
    const fit = await fitOf(canvas, l)
    const bomb = st.bombs[0]!
    // 「正解ゾーンの真上、フィールド最下部」で待機する自然な操作
    const zone = l.zones.find((z) => z.kind === bomb.kind)!
    const hold = { x: zone.rect.x + zone.rect.w / 2, y: l.field.y + l.field.h - 28 }
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
    await canvas.dispatchEvent('pointermove', ev(toClient(fit, hold), 1))
    await advance(page, 16)
    st = await state(page)
    const held = st.bombs.find((b) => b.grabbedBy === 1)
    if (!held) {
      console.log(`### 試行${attempt}: 掴めなかった`)
      continue
    }
    const screenPt = toClient(fit, hold)

    await page.setViewportSize({ width: 430, height: H1 })
    await page.waitForTimeout(300)
    await advance(page, 16)
    const l1 = await layout(page)
    const fit1 = await fitOf(canvas, l1)
    const logicalNow = {
      x: (screenPt.x - fit1.boxX - fit1.offsetX) / fit1.scale,
      y: (screenPt.y - fit1.boxY - fit1.offsetY) / fit1.scale,
    }
    const zNow = l1.zones.find(
      (z) =>
        logicalNow.x >= z.rect.x &&
        logicalNow.x <= z.rect.x + z.rect.w &&
        logicalNow.y >= z.rect.y &&
        logicalNow.y <= z.rect.y + z.rect.h
    )
    await canvas.dispatchEvent('pointerup', ev(screenPt, 0))
    await advance(page, 16)
    st = await state(page)
    console.log(
      `### 試行${attempt} kind=${held.kind} 保持論理=(${held.x.toFixed(0)},${held.y.toFixed(0)}) ` +
        `H:${H0}(logicalH ${l.logicalH})→${H1}(logicalH ${l1.logicalH}) ` +
        `同一画面座標の論理=(${logicalNow.x.toFixed(0)},${logicalNow.y.toFixed(0)}) ゾーン=${zNow?.kind ?? 'なし'} ` +
        `→ phase=${st.phase} 死因=${st.deathReason ?? 'なし'} score=${st.score}`
    )
  }
  expect(errors).toEqual([])
})

/** 逆側（間違ったゾーンの上）で待機していたケース。指を動かさず離す */
test('2d. 誤ゾーンの真上で待機 → 縮小 → そのまま離す', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  let died = 0
  for (const attempt of [0, 1, 2, 3, 4, 5]) {
    await page.setViewportSize({ width: 430, height: 932 })
    await page.goto(`./?frozen=1&seed=${2000 + attempt}`)
    await ready(page)
    await startGame(page)
    await advanceBy(page, 1500)
    const canvas = page.locator('#game')
    const l = await layout(page)
    let st = await state(page)
    const fit = await fitOf(canvas, l)
    const bomb = st.bombs[0]!
    const wrong = l.zones.find((z) => z.kind !== bomb.kind)!
    const hold = { x: wrong.rect.x + wrong.rect.w / 2, y: l.field.y + l.field.h - 28 }
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
    await canvas.dispatchEvent('pointermove', ev(toClient(fit, hold), 1))
    await advance(page, 16)
    const screenPt = toClient(fit, hold)
    st = await state(page)
    const held = st.bombs.find((b) => b.grabbedBy === 1)
    if (!held) continue
    await page.setViewportSize({ width: 430, height: 832 })
    await page.waitForTimeout(300)
    await advance(page, 16)
    const l1 = await layout(page)
    const fit1 = await fitOf(canvas, l1)
    const ly = (screenPt.y - fit1.boxY - fit1.offsetY) / fit1.scale
    const lx = (screenPt.x - fit1.boxX - fit1.offsetX) / fit1.scale
    const zNow = l1.zones.find(
      (z) =>
        lx >= z.rect.x && lx <= z.rect.x + z.rect.w && ly >= z.rect.y && ly <= z.rect.y + z.rect.h
    )
    await canvas.dispatchEvent('pointerup', ev(screenPt, 0))
    await advance(page, 16)
    st = await state(page)
    if (st.phase === 'exploding' || st.phase === 'gameover') died++
    console.log(
      `### 試行${attempt} kind=${held.kind} 誤ゾーン=${wrong.kind} の真上で待機 ` +
        `logicalH ${l.logicalH}→${l1.logicalH} 同一画面座標の論理=(${lx.toFixed(0)},${ly.toFixed(0)}) ゾーン=${zNow?.kind ?? 'なし'} ` +
        `→ phase=${st.phase} 死因=${st.deathReason ?? 'なし'}`
    )
  }
  console.log(`### 指を動かさず離して死んだ回数: ${died}/6`)
  expect(errors).toEqual([])
})
