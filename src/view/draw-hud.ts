import { FIELD, FUSE, SCORE } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout, World } from '../core/types'
import { comboMultiplier } from '../game/score'
import { COLOR } from './palette'

/**
 * スコア・記録・連鎖と、連鎖の残り時間ゲージ。
 *
 * 左に得点、右に連鎖を置き、それぞれ左揃え・右揃えにする。
 * 一度スコアが 5 桁になったところで中央寄せの連鎖表示と重なったので、
 * 「桁が増えても衝突しない」ことを配置の条件にしている。
 * 右端には DOM のボタンが乗っているので、その幅ぶんは空ける。
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  w: World,
  layout: Layout,
  best: number
): void {
  const h = layout.hud
  const right = h.x + h.w - FIELD.HUD_RESERVED_RIGHT
  ctx.save()
  ctx.textBaseline = 'alphabetic'

  // ---- 得点 ----
  ctx.fillStyle = COLOR.textDim
  ctx.font = '600 11px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('得点', h.x, h.y + 12)

  const scoreText = String(w.score)
  // 桁が伸びても右側にぶつからないよう、長くなったら小さくする
  const scoreSize = scoreText.length > 7 ? 20 : scoreText.length > 5 ? 24 : 28
  ctx.fillStyle = COLOR.text
  ctx.font = `700 ${scoreSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.fillText(scoreText, h.x, h.y + 36)

  // ---- 記録と、いちばん危ないボムの残り秒 ----
  // 死ぬ主因は導火線切れなので、見逃すと死ぬ情報を、
  // 取れると嬉しい情報（連鎖）より優先して目立つ位置に出す
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

  const infoX = h.x + 92
  ctx.font = '700 13px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'left'
  if (minRatio < FUSE.WARN_RATIO && Number.isFinite(minLeft)) {
    ctx.fillStyle = minRatio < FUSE.CRITICAL_RATIO ? COLOR.danger : COLOR.accent
    ctx.fillText(`残り ${minLeft.toFixed(1)} 秒`, infoX, h.y + 36)
  } else if (best > w.score) {
    ctx.font = '600 12px system-ui, -apple-system, "Hiragino Sans", sans-serif'
    ctx.fillStyle = COLOR.textDim
    ctx.fillText(`最高 ${best}`, infoX, h.y + 36)
  } else if (best > 0) {
    ctx.fillStyle = COLOR.accent
    ctx.fillText('新記録', infoX, h.y + 36)
  }

  // ---- 連鎖 ----
  if (w.combo > 0) {
    const mult = comboMultiplier(w.combo)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLOR.accent
    ctx.font = '700 15px system-ui, -apple-system, "Hiragino Sans", sans-serif'
    ctx.fillText(`${w.combo} 連鎖  x${mult.toFixed(1)}`, right, h.y + 22)

    // 連鎖が切れるまでの残り。急いで捌く動機を可視化する
    const gw = 104
    const gx = right - gw
    const gy = h.y + 30
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
