import { FIELD, FUSE, SCORE } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout, World } from '../core/types'
import { comboMultiplier } from '../game/score'
import { COLOR } from './palette'

/**
 * スコア・記録・コンボと、コンボ窓の残りゲージ。
 *
 * 左列（スコアと警告）と右列（コンボ）を、それぞれ左揃え・右揃えで別の列に置く。
 * 一度スコアが 5 桁になったところで中央寄せのコンボと重なったので、
 * 「桁が増えても衝突しない」ことを配置の条件にしている。
 * 右上には DOM のボタンが乗っているので、右列はその下の帯に置く。
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  w: World,
  layout: Layout,
  best: number
): void {
  const h = layout.hud
  // 右端は DOM のボタンの手前まで。ここを越えると Canvas の文字がボタンの下に潜る
  const right = h.x + h.w - FIELD.HUD_RESERVED_RIGHT
  ctx.save()
  ctx.textBaseline = 'alphabetic'

  // ---- 左列: スコア ----
  ctx.fillStyle = COLOR.textDim
  ctx.font = '600 11px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('スコア', h.x, h.y + 14)

  const scoreText = String(w.score)
  // 桁が伸びても右列にぶつからないよう、長くなったら小さくする
  const scoreSize = scoreText.length > 7 ? 20 : scoreText.length > 5 ? 24 : 28
  ctx.fillStyle = COLOR.text
  ctx.font = `700 ${scoreSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.fillText(scoreText, h.x, h.y + 40)

  // ---- 左列: いちばん危ないボムの残り秒 ----
  // 死ぬ主因は導火線切れなので、見逃すと死ぬ情報を、
  // 取れると嬉しい情報（コンボ）より優先してここに出す
  let minRatio = 1
  let minLeft = Infinity
  for (const b of w.bombs) {
    if (b.vanish > 0 || b.fuseMax <= 0) continue
    const r = b.fuse / b.fuseMax
    if (r < minRatio) {
      minRatio = r
      minLeft = b.fuse
    }
  }

  ctx.font = '600 12px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'left'
  if (minRatio < FUSE.WARN_RATIO && Number.isFinite(minLeft)) {
    ctx.fillStyle = minRatio < FUSE.CRITICAL_RATIO ? COLOR.danger : COLOR.accent
    ctx.fillText(`いそいで！ あと ${minLeft.toFixed(1)}`, h.x, h.y + 58)
  } else if (best > w.score) {
    // 自己ベスト更新中に同じ数字を 2 つ並べても情報が増えないので、上回っている間だけ出す
    ctx.fillStyle = COLOR.textDim
    ctx.fillText(`ベスト ${best}`, h.x, h.y + 58)
  } else if (best > 0) {
    ctx.fillStyle = COLOR.accent
    ctx.fillText('しんきろく！', h.x, h.y + 58)
  }

  // ---- 右列: コンボ ----
  if (w.combo > 0) {
    const mult = comboMultiplier(w.combo)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLOR.accent
    ctx.font = '700 14px system-ui, -apple-system, "Hiragino Sans", sans-serif'
    ctx.fillText(`${w.combo} れんさ  x${mult.toFixed(1)}`, right, h.y + 30)

    // コンボ窓の残りゲージ。急いで捌く動機を可視化する
    const gw = 96
    const gx = right - gw
    const gy = h.y + 38
    const ratio = clamp(w.comboTimer / SCORE.COMBO_WINDOW, 0, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, 4, 2)
    ctx.fill()
    ctx.fillStyle = ratio < 0.3 ? COLOR.danger : COLOR.accent
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw * ratio, 4, 2)
    ctx.fill()
  }

  ctx.restore()
}
