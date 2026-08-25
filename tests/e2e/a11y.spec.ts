import { expect, test } from '@playwright/test'
import { advanceBy, layout, ready, startGame, state } from '../helpers/game'

async function expectTapTarget(page: import('@playwright/test').Page, name: string) {
  const btn = page.getByRole('button', { name })
  await expect(btn).toBeVisible()
  const box = await btn.boundingBox()
  expect(box!.width, `${name} の幅`).toBeGreaterThanOrEqual(44)
  expect(box!.height, `${name} の高さ`).toBeGreaterThanOrEqual(44)
}

test('操作ボタンに読み上げ用の名前があり、タップ領域が 44px 以上ある', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  // タイトルでは、音は切りたくなる場面なのでミュートは押せるままにしてある。
  // 一時停止はここでは意味を持たないので出さない
  await expectTapTarget(page, '音を消す')
  await expectTapTarget(page, 'ゲーム開始')
  await expect(page.getByRole('button', { name: '一時停止' })).toBeHidden()

  await startGame(page)
  await expectTapTarget(page, '一時停止')
  await expectTapTarget(page, '音を消す')
})

test('ポーズ中は「つづける」が 1 つだけで、ミュートは押せる', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  await startGame(page)

  await page.getByRole('button', { name: '一時停止' }).click()
  await advanceBy(page, 40)

  // 同じ機能のボタンが 2 つ並ばないこと
  await expect(page.getByRole('button', { name: '一時停止' })).toBeHidden()
  await expect(page.getByRole('button', { name: '再開する' })).toBeHidden()
  await expect(page.getByRole('button', { name: '再開' })).toBeVisible()

  // 音を切りたくなるのはまさにこの場面なので、ミュートは生きている
  await page.getByRole('button', { name: '音を消す' }).click()
  await expect(page.getByRole('button', { name: '音を出す' })).toBeVisible()
})

test('見出しと lang 属性がある', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.locator('canvas#game')).toHaveAttribute('role', 'application')
})

test('プレイ中はスコアが読み上げ用の領域に流れる', async ({ page }) => {
  await page.goto('./?seed=7&frozen=1')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 1500)
  const text = await page.locator('#sr-status').textContent()
  expect(text).toContain('スコア')
})

test('ゲームオーバーは assertive で知らせる', async ({ page }) => {
  await page.goto('./?seed=7&frozen=1')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 20_000)
  expect((await state(page)).phase).toBe('gameover')
  const alert = page.locator('#sr-alert')
  await expect(alert).toHaveAttribute('aria-live', 'assertive')
  expect(await alert.textContent()).toContain('ゲームオーバー')
})

test('動きを減らす設定でも遊べる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./?seed=3&frozen=1')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 2000)
  expect((await state(page)).phase).toBe('playing')
})

test('キーボードだけで開始と一時停止ができる', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  // ボタンを狙ってタブ移動しなくても、Space だけで始められる
  await page.keyboard.press('Space')
  expect((await state(page)).phase).toBe('ready')

  await advanceBy(page, 1800)
  expect((await state(page)).phase).toBe('playing')

  await page.keyboard.press('Escape')
  expect((await state(page)).phase).toBe('paused')
  // frozen=1 では描画がフレーム送りなので、1 フレーム進めて画面を更新させる
  await advanceBy(page, 32)
  await expect(page.getByRole('button', { name: '再開' })).toBeVisible()

  // 開いた画面へフォーカスが移り、読み上げが今どの画面かを伝えられる状態になる。
  // ここから先の Tab 移動はブラウザ側の設定（WebKit のフルキーボードアクセス）に
  // 左右されるので、テストでは踏み込まない。
  const focusedInPaused = await page.evaluate(() => {
    const paused = document.querySelector('.screen-paused')
    return Boolean(paused && paused.contains(document.activeElement))
  })
  expect(focusedInPaused).toBe(true)
})

test('レイアウトは箱が画面の外へ出ない', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)
  const l = await layout(page)
  for (const z of l.zones) {
    expect(z.rect.y + z.rect.h).toBeLessThanOrEqual(l.logicalH)
    expect(z.rect.x).toBeGreaterThanOrEqual(0)
    expect(z.rect.x + z.rect.w).toBeLessThanOrEqual(l.logicalW)
  }
  // 横持ちならフィールドは左右の箱の「間」に、縦持ちなら箱の「上」にある。
  // どちらでも、フィールドと箱は重ならない
  const portrait = l.logicalH > l.logicalW
  if (portrait) {
    expect(l.field.y + l.field.h).toBeLessThanOrEqual(l.zones[0]!.rect.y)
  } else {
    expect(l.field.x).toBeGreaterThanOrEqual(l.zones[0]!.rect.x + l.zones[0]!.rect.w)
    expect(l.field.x + l.field.w).toBeLessThanOrEqual(l.zones[1]!.rect.x)
  }
  for (const z of l.zones) {
    expect(z.rect.y + z.rect.h).toBeLessThanOrEqual(l.logicalH)
  }
})

test('全画面ボタンは、使える環境でだけ出る', async ({ page }) => {
  await page.goto('./?seed=1&frozen=1')
  await ready(page)

  const supported = await page.evaluate(() =>
    Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen)
  )
  const btn = page.getByRole('button', { name: '全画面にする' })

  if (supported) {
    await expect(btn).toBeVisible()
    const box = await btn.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    // 使える環境では、ホーム画面追加の案内は出さない
    await expect(page.getByText('ホーム画面に追加すると')).toBeHidden()
  } else {
    // 使えない環境（iPhone の Safari）では、代わりにホーム画面追加をすすめる
    await expect(btn).toBeHidden()
    await expect(page.getByText('ホーム画面に追加すると')).toBeVisible()
  }
})
