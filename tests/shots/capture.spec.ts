import { expect, test } from '@playwright/test'
import { advanceBy, drag, fitOf, layout, ready, startGame, state, zoneCenter } from '../helpers/game'

/**
 * 目視確認用のスクリーンショットを撮る。
 *
 * 画像比較（toHaveScreenshot）はあえて使わない。Canvas のアニメーションと
 * フォント描画の差で CI が必ず不安定になり、--update-snapshots を惰性で叩く運用に堕落する。
 * 機械判定は getState() の数値で行い、スクショは人が見るためのものと割り切る。
 */
/**
 * ページ内で自動プレイして、指定秒数ぶんゲームを進める。
 *
 * 同時存在の上限は 25 秒ごとに 1 増えて 125 秒で 8 になるが、放置では 9 秒で
 * 導火線が尽きて死ぬので、放っておくと密度の高い画面を一度も見られない。
 * ドラッグは Playwright 側から送ると往復が多くて遅いので、ページ内で完結させる。
 */
async function autoPlay(page: import('@playwright/test').Page, seconds: number) {
  await page.evaluate((sec) => {
    const h = window.__BOMB_SORTER__!
    const canvas = document.querySelector('canvas#game') as HTMLCanvasElement
    const box = canvas.getBoundingClientRect()
    // getLayout も getState も毎回まるごと複製を返すので、
    // ループの中で何度も呼ぶと 140 秒ぶんを回しきる前に時間切れになる
    const l = h.getLayout()
    const scale = Math.min(box.width / l.logicalW, box.height / l.logicalH)
    const ox = (box.width - l.logicalW * scale) / 2
    const oy = (box.height - l.logicalH * scale) / 2
    const zoneOf = new Map(l.zones.map((z) => [z.kind, z]))

    const send = (type: string, x: number, y: number, buttons: number) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          bubbles: true,
          buttons,
          clientX: box.x + ox + x * scale,
          clientY: box.y + oy + y * scale,
        })
      )
    }

    const step = 20
    const ticks = Math.ceil((sec * 1000) / step)
    for (let t = 0; t < ticks; t++) {
      // 状態の取得は毎回まるごと複製を返すので重い。5 フレームに 1 回で足りる
      if (t % 5 === 0) {
        const w = h.getState()
        if (w.phase === 'playing') {
          const living = w.bombs.filter((b) => b.vanish === 0 && b.grabbedBy === null)
          living.sort((a, b) => a.fuse / a.fuseMax - b.fuse / b.fuseMax)
          const target = living[0]
          // 上限に近いときだけ捌いて、ボムが溜まった状態を作る
          if (target && target.fuse / target.fuseMax < 0.45) {
            const zone = zoneOf.get(target.kind)!
            const to = { x: zone.rect.x + zone.rect.w / 2, y: zone.rect.y + zone.rect.h / 2 }
            send('pointerdown', target.x, target.y, 1)
            h.advance(step)
            send('pointermove', to.x, to.y, 1)
            h.advance(step)
            send('pointerup', to.x, to.y, 0)
          }
        }
      }
      h.advance(step)
    }
  }, seconds)
}

test.describe.configure({ mode: 'serial' })
// スクリーンショットは 3 端末ぶんを並列で撮るので、1 本あたりの余裕を大きく取る。
// 120 秒だと、並列で走らせたときだけ時間切れになって CI が落ちた
test.setTimeout(300_000)

const OUT = 'shots'

test('主要な画面を撮る', async ({ page }, info) => {
  const dev = info.project.name
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${dev}-${name}.png` })

  await page.goto('./?seed=20260825&frozen=1')
  await ready(page)
  await page.evaluate(() => document.fonts.ready)

  // 1) タイトル
  await shot('01-title')

  // 2) プレイ開始直後
  await startGame(page)
  await advanceBy(page, 1200)
  await shot('02-playing')

  // 3) 画面いっぱいにボムすけがいる状態。
  //    開始時点ですでに上限近くまで出るので、少し捌けば密度の高い画面になる
  await autoPlay(page, 35)
  await shot('03-busy')

  // 4) 掴んでゾーンの上にいる状態（ハイライトの見え方を見る）
  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l)
  const s = await state(page)
  const bomb = s.bombs.find((b) => b.vanish === 0)
  if (bomb && s.phase === 'playing') {
    const to = zoneCenter(l, bomb.kind)
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      buttons: 1,
      clientX: fit.boxX + fit.offsetX + bomb.x * fit.scale,
      clientY: fit.boxY + fit.offsetY + bomb.y * fit.scale,
    })
    await advanceBy(page, 32)
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      buttons: 1,
      clientX: fit.boxX + fit.offsetX + to.x * fit.scale,
      clientY: fit.boxY + fit.offsetY + to.y * fit.scale,
    })
    await advanceBy(page, 32)
    await shot('04-hover')

    // 5) 正解してコンボが乗った状態
    await canvas.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      buttons: 0,
      clientX: fit.boxX + fit.offsetX + to.x * fit.scale,
      clientY: fit.boxY + fit.offsetY + to.y * fit.scale,
    })
    await advanceBy(page, 64)
    await shot('05-success')
  }

  // 6) 一時停止
  await page.evaluate(() => window.__BOMB_SORTER__!.command('pause'))
  await advanceBy(page, 32)
  await shot('06-paused')
  await page.evaluate(() => window.__BOMB_SORTER__!.command('resume'))
  await advanceBy(page, 2000)

  // 7) 何度か正解してスコアを積んでから
  for (let i = 0; i < 4; i++) {
    const st = await state(page)
    if (st.phase !== 'playing') break
    const b = st.bombs.find((x) => x.vanish === 0)
    if (!b) break
    await drag(page, canvas, fit, { x: b.x, y: b.y }, zoneCenter(l, b.kind), 4)
    await page.evaluate(() => {
      const h = window.__BOMB_SORTER__!
      h.advance(16)
      for (let k = 0; k < 120 && h.getState().bombs.filter((x) => x.vanish === 0).length === 0; k++) {
        h.advance(16)
      }
    })
  }
  await shot('07-scored')

  // 8) ゲームオーバー
  await advanceBy(page, 30_000)
  await shot('08-gameover')
})

/**
 * 違う色の箱の上にいるときの表示。
 *
 * ここで警告を出さないのが仕様。落とす前に正誤が分かると、慌てて間違える
 * 瞬間が無くなってパニックゲームでなくなる。正しい箱の上と同じ見た目に
 * なっていることを、撮って目で確かめられるようにしておく。
 */
test('違う色の箱の上にいる状態を撮る', async ({ page }, info) => {
  await page.goto('./?seed=4242&frozen=1')
  await ready(page)
  await startGame(page)
  await advanceBy(page, 600)

  const canvas = page.locator('canvas#game')
  const l = await layout(page)
  const fit = await fitOf(canvas, l)
  const s = await state(page)
  const bomb = s.bombs.find((b) => b.vanish === 0)
  if (!bomb) throw new Error('ボムがない')
  const wrong = zoneCenter(l, bomb.kind === 'red' ? 'black' : 'red')

  const at = (p: { x: number; y: number }) => ({
    clientX: fit.boxX + fit.offsetX + p.x * fit.scale,
    clientY: fit.boxY + fit.offsetY + p.y * fit.scale,
  })
  const base = { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true }

  await canvas.dispatchEvent('pointerdown', { ...base, buttons: 1, ...at(bomb) })
  await advanceBy(page, 40)
  await canvas.dispatchEvent('pointermove', { ...base, buttons: 1, ...at(wrong) })
  await advanceBy(page, 40)
  await page.screenshot({ path: `${OUT}/${info.project.name}-09-wrong-hover.png` })
})

/**
 * ノッチとホームインジケータがある端末のレイアウト。
 * Playwright は env(safe-area-inset-*) を設定できないので、URL から差し込む。
 * これが無いと、実機より 2 割広いフィールドしか目視できない。
 */
test('ノッチ端末のレイアウトを撮る', async ({ page }, info) => {
  await page.goto('./?seed=4242&frozen=1&insets=47,0,34,0')
  await ready(page)
  await page.screenshot({ path: `${OUT}/${info.project.name}-10-insets-title.png` })
  await startGame(page)
  await advanceBy(page, 1200)
  await page.screenshot({ path: `${OUT}/${info.project.name}-11-insets-playing.png` })

  // 箱がホームインジケータの領域に食い込んでいないことを数値でも押さえる。
  //
  // insets は CSS px で渡している（env() と同じ単位）ので、論理単位の座標と
  // そのまま比べてはいけない。拡大率が 1 でない端末だけ食い違い、
  // 手元の iPhone では通って CI のデスクトップで落ちた。CSS px に揃えて比べる。
  const l = await layout(page)
  const fit = await fitOf(page.locator('canvas#game'), l)
  const bottomInsetCss = 34
  for (const z of l.zones) {
    const bottomCss = fit.offsetY + (z.rect.y + z.rect.h) * fit.scale
    const canvasH = fit.offsetY * 2 + l.logicalH * fit.scale
    expect(canvasH - bottomCss).toBeGreaterThanOrEqual(bottomInsetCss - 1)
  }
})
