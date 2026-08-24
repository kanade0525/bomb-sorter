import { SCORE } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout, World } from '../core/types'
import { COLOR } from './palette'
import { comboMultiplier } from '../game/score'

/** スコア・ハイスコア・コンボと、コンボ窓の残りゲージ */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  w: World,
  layout: Layout,
  best: number
): void {
  const h = layout.hud
  ctx.save()
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = COLOR.textDim
  ctx.font = '600 11px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('スコア', h.x, h.y + 14)

  ctx.fillStyle = COLOR.text
  ctx.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(String(w.score), h.x, h.y + 42)

  ctx.fillStyle = COLOR.textDim
  ctx.font = '600 11px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`ベスト ${Math.max(best, w.score)}`, h.x, h.y + 58)

  // コンボ。左上のボタン列と重ならないよう、中央寄りに置く
  if (w.combo > 0) {
    const cx = h.x + h.w * 0.62
    const mult = comboMultiplier(w.combo)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLOR.accent
    ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(`${w.combo} れんさ`, cx, h.y + 30)

    ctx.fillStyle = COLOR.text
    ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(`x${mult.toFixed(1)}`, cx, h.y + 50)

    // コンボ窓の残りゲージ。急いで捌く動機を可視化する
    const gw = 78
    const gx = cx - gw
    const gy = h.y + 56
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
