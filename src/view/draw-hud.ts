import { BOMB, FIELD, FUSE, SCORE } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout, World } from '../core/types'
import { comboMultiplier } from '../game/score'
import { COLOR } from './palette'
import { drawPixelText, measurePixelText, pixelTextHeight } from './pixel-font'

/**
 * 得点・記録・連鎖と、連鎖の残り時間ゲージ。
 *
 * 数字はドットで組んだ字形で描く（pixel-font.ts）。一番目に入るものなので、
 * ここがシステムフォントのままだと画面全体のピクセルの目から浮いてしまう。
 * 言葉のラベルだけはシステムフォントのまま — 漢字を 5x7 で組むと読めなくなる。
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
  const label = '600 11px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.save()
  ctx.textBaseline = 'alphabetic'

  // ---- 得点 ----
  ctx.fillStyle = COLOR.textDim
  ctx.font = label
  ctx.textAlign = 'left'
  ctx.fillText('得点', h.x, h.y + 12)

  const scoreText = String(w.score)
  // 桁が伸びても右側にぶつからないよう、長くなったらドットを小さくする
  const scoreDot = scoreText.length > 7 ? 2 : scoreText.length > 5 ? 3 : 4
  drawPixelText(ctx, scoreText, h.x, h.y + 16, scoreDot, COLOR.text)

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

  const infoX = h.x + measurePixelText('0000000', scoreDot) + 14
  const infoY = h.y + 16
  ctx.textAlign = 'left'
  if (minRatio < FUSE.WARN_RATIO && Number.isFinite(minLeft)) {
    const color = minRatio < FUSE.CRITICAL_RATIO ? COLOR.danger : COLOR.accent
    ctx.fillStyle = color
    ctx.font = '700 12px system-ui, -apple-system, "Hiragino Sans", sans-serif'
    ctx.fillText('残り', infoX, infoY + 2)
    drawPixelText(ctx, minLeft.toFixed(1), infoX + 30, infoY, 3, color)
    ctx.fillStyle = color
    ctx.fillText('秒', infoX + 30 + measurePixelText('0.0', 3) + 4, infoY + 2)
  } else if (best > w.score) {
    ctx.fillStyle = COLOR.textDim
    ctx.font = label
    ctx.fillText('最高', infoX, infoY + 2)
    drawPixelText(ctx, String(best), infoX + 26, infoY, 2, COLOR.textDim)
  } else if (best > 0) {
    ctx.fillStyle = COLOR.accent
    ctx.font = '700 12px system-ui, -apple-system, "Hiragino Sans", sans-serif'
    ctx.fillText('新記録', infoX, infoY + 2)
  }

  // ---- 連鎖 ----
  if (w.combo > 0) {
    const mult = comboMultiplier(w.combo)
    const multText = `x${mult.toFixed(1)}`
    const comboText = String(w.combo)
    const dot = 3

    // 右から「x5.0」「連鎖」「12」の順に積む
    const multW = measurePixelText(multText, dot)
    drawPixelText(ctx, multText, right, h.y + 8, dot, COLOR.accent, 'right')

    ctx.textAlign = 'right'
    ctx.fillStyle = COLOR.accent
    ctx.font = '700 13px system-ui, -apple-system, "Hiragino Sans", sans-serif'
    const wordRight = right - multW - 8
    ctx.fillText('連鎖', wordRight, h.y + 8 + pixelTextHeight(dot) - 3)
    drawPixelText(ctx, comboText, wordRight - 30, h.y + 8, dot, COLOR.accent, 'right')

    // 連鎖が切れるまでの残り。滑らかなバーではなくドットの目盛りで見せる
    const cells = 12
    const cell = 6
    const gap = 2
    const gw = cells * cell + (cells - 1) * gap
    const gx = right - gw
    const gy = h.y + 8 + pixelTextHeight(dot) + 6
    const ratio = clamp(w.comboTimer / SCORE.COMBO_WINDOW, 0, 1)
    const lit = Math.ceil(ratio * cells)
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle =
        i < lit ? (ratio < 0.3 ? COLOR.danger : COLOR.accent) : 'rgba(255,255,255,0.13)'
      ctx.fillRect(gx + i * (cell + gap), gy, cell, 4)
    }
  }

  ctx.restore()
  void BOMB
}
