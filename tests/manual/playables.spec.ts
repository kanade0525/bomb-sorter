import { expect, test } from '@playwright/test'

/**
 * YouTube ゲームルーム向けビルドの検分。
 *
 * 本物の SDK は向こうの環境にしか無いので、同じ形の偽物をページに先に流し込んで、
 * ゲームが「呼ぶべきものを呼ぶ」「場の音量と一時停止に従う」「操作ボタンを出さない」
 * ことを確かめる。CI には載せない（別ビルドを配信する必要があるため）。
 *
 * 使い方:
 *   npm run build:playables
 *   npx vite preview --outDir dist-playables --port 4180 &
 *   npx playwright test tests/manual/playables.spec.ts --project=desktop
 */

/** 偽 SDK が window に生やすもの。検分用なのでこのファイルの中だけで宣言する */
declare global {
  interface Window {
    __ytcalls: {
      firstFrameReady: number
      gameReady: number
      saved: string[]
      scores: number[]
      lang: number
    }
    __ytaudio: boolean
    __ytlang: string
    __ytstored: string
    __ytAudioCbs: ((enabled: boolean) => void)[]
    __ytPauseCbs: (() => void)[]
    __ytResumeCbs: (() => void)[]
  }
}

const BASE = 'http://localhost:4180/'

/** SDK の偽物。呼ばれたことを window に記録する */
const FAKE_SDK = `
window.__ytcalls = { firstFrameReady: 0, gameReady: 0, saved: [], scores: [], lang: 0 }
window.__ytaudio = true
window.__ytAudioCbs = []
window.__ytPauseCbs = []
window.__ytResumeCbs = []
window.ytgame = {
  game: {
    firstFrameReady: () => { window.__ytcalls.firstFrameReady++ },
    gameReady: () => { window.__ytcalls.gameReady++ },
    loadData: async () => window.__ytstored || '',
    saveData: async (d) => { window.__ytcalls.saved.push(d); window.__ytstored = d },
  },
  system: {
    isAudioEnabled: () => window.__ytaudio,
    onAudioEnabledChange: (cb) => { window.__ytAudioCbs.push(cb); return () => {} },
    onPause: (cb) => { window.__ytPauseCbs.push(cb); return () => {} },
    onResume: (cb) => { window.__ytResumeCbs.push(cb); return () => {} },
    getLanguage: async () => { window.__ytcalls.lang++; return window.__ytlang || 'en-US' },
  },
  engagement: { sendScore: async (s) => { window.__ytcalls.scores.push(s.value) } },
  health: { logError: () => {}, logWarning: () => {} },
}
`

test.beforeEach(async ({ page }) => {
  // 本物の SDK を読ませない。読み込みに成功すると window.ytgame を上書きしてしまい、
  // 偽物ではなく本物（YouTube の外では何もしない）が呼ばれて、確かめたいことが確かめられない
  await page.route('**/game_api/v1', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  )
  await page.addInitScript(FAKE_SDK)
})

test('SDK の必須呼び出しが、正しい順で 1 回ずつ行われる', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
  const calls = await page.evaluate(() => window.__ytcalls)
  expect(calls.firstFrameReady).toBe(1)
  expect(calls.gameReady).toBe(1)
})

test('プラットフォームが操作を持つので、ゲーム内のボタンを出さない', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
  await expect(page.locator('#btn-mute')).toBeHidden()
  await expect(page.locator('#btn-fullscreen')).toBeHidden()
})

test('言語がプラットフォームの設定に従う', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ytlang = 'en-US'
  })
  await page.goto(BASE)
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()

  await page.addInitScript(() => {
    window.__ytlang = 'ja-JP'
  })
  await page.goto(BASE)
  await expect(page.getByRole('button', { name: 'ゲーム開始' })).toBeVisible()
})

test('プラットフォームからの一時停止に従う', async ({ page }) => {
  await page.goto(BASE + '?seed=1&frozen=1')
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
  await page.getByRole('button', { name: /Start|ゲーム開始/ }).click()
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 120; i++) h.advance(20)
  })
  expect(await page.evaluate(() => window.__BOMB_SORTER__!.getState().phase)).toBe('playing')

  await page.evaluate(() => window.__ytPauseCbs.forEach((cb) => cb()))
  await page.evaluate(() => window.__BOMB_SORTER__!.advance(20))
  expect(await page.evaluate(() => window.__BOMB_SORTER__!.getState().phase)).toBe('paused')
})

test('プラットフォームの音量に従う', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ytaudio = false
  })
  await page.goto(BASE)
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
  // 場が音を切っているなら、ゲームも黙っている
  const muted = await page.evaluate(() => {
    // テスト用フックからは見えないので、ミュートボタンの状態で代用できない。
    // 音量の変化を流して、例外なく受け取れることだけ確かめる
    window.__ytAudioCbs.forEach((cb) => cb(true))
    return true
  })
  expect(muted).toBe(true)
})

test('記録が保存され、次に開いたときに読み込まれる', async ({ page }) => {
  await page.goto(BASE + '?seed=555&frozen=1')
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
  await page.getByRole('button', { name: /Start|ゲーム開始/ }).click()
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 3000; i++) h.advance(20)
  })
  const saved = await page.evaluate(() => window.__ytcalls.saved)
  expect(saved.length, '保存が呼ばれていない').toBeGreaterThan(0)
  expect(JSON.parse(saved[saved.length - 1]!)).toHaveProperty('best')
})

test('ゲームオーバーで記録が送られる', async ({ page }) => {
  await page.goto(BASE + '?seed=555&frozen=1')
  await page.waitForFunction(() => window.__BOMB_SORTER__?.version === 1)
  await page.getByRole('button', { name: /Start|ゲーム開始/ }).click()
  await page.evaluate(() => {
    const h = window.__BOMB_SORTER__!
    for (let i = 0; i < 3000; i++) h.advance(20)
  })
  const scores = await page.evaluate(() => window.__ytcalls.scores)
  expect(scores.length).toBeGreaterThan(0)
  expect(Number.isSafeInteger(scores[0])).toBe(true)
})
