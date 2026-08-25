import { FIELD, FUSE, SCORE } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout, World } from '../core/types'
import { comboMultiplier } from '../game/score'
import { t } from '../ui/strings'
import { COLOR } from './palette'
import { drawPixelText, measurePixelText, pixelTextHeight } from './pixel-font'

const LABEL = '600 11px system-ui, -apple-system, "Hiragino Sans", sans-serif'
const LABEL_BOLD = '700 12px system-ui, -apple-system, "Hiragino Sans", sans-serif'

/**
 * 得点・記録・連鎖と、連鎖の残り時間ゲージ。
 *
 * 数字はドットで組んだ字形で描く（pixel-font.ts）。一番目に入るものなので、
 * ここがシステムフォントのままだと画面全体のピクセルの目から浮いてしまう。
 * 言葉のラベルだけはシステムフォントのまま — 漢字を 5x7 で組むと読めなくなる。
 *
 * 横持ちは 1 段、縦持ちは横幅が足りないので 2 段に組み替える。
 * 「桁が増えても衝突しない」ことを配置の条件にしている（一度 5 桁で重なった）。
 * 右端には DOM のボタンが乗っているので、その幅ぶんは必ず空ける。
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  w: World,
  layout: Layout,
  best: number
): void {
  const h = layout.hud
  const right = h.x + h.w - FIELD.HUD_RESERVED_RIGHT
  // 得点と連鎖を 1 行に並べられるだけの幅があるか
  const twoRows = right - h.x < 230

  ctx.save()
  ctx.textBaseline = 'alphabetic'

  // ---- 得点 ----
  ctx.fillStyle = COLOR.textDim
  ctx.font = LABEL
  ctx.textAlign = 'left'
  ctx.fillText(t().score, h.x, h.y + 12)

  const scoreText = String(w.score)
  const scoreDot = scoreText.length > 7 ? 2 : scoreText.length > 5 ? 3 : 4
  drawPixelText(ctx, scoreText, h.x, h.y + 16, scoreDot, COLOR.text)

  // ---- いちばん危ないボムの残り秒、または記録 ----
  // 死ぬ主因は導火線切れなので、見逃すと死ぬ情報を、
  // 取れると嬉しい情報（連鎖）より優先して目立つ位置に出す
  const urgent = findUrgent(w)
  const infoX = h.x + measurePixelText('0000000', scoreDot) + 14
  const infoY = h.y + 16
  drawInfo(ctx, urgent, best, w.score, infoX, infoY)

  // ---- 連鎖 ----
  if (w.combo > 0) {
    const dot = 3
    // 2 段組みのときは得点の下の行へ。その行にはボタンが無いので右端まで使える
    const comboRight = twoRows ? h.x + h.w : right
    const comboY = twoRows ? h.y + 16 + pixelTextHeight(scoreDot) + 6 : h.y + 8
    drawCombo(ctx, w, comboRight, comboY, dot)
  }

  ctx.restore()
}

function findUrgent(w: World): { ratio: number; left: number } | null {
  let ratio = 1
  let left = Infinity
  for (const b of w.bombs) {
    if (b.vanish > 0 || b.fuseMax <= 0) continue
    const r = b.fuse / b.fuseMax
    if (r < ratio) {
      ratio = r
      left = b.fuse
    }
  }
  if (ratio >= FUSE.WARN_RATIO || !Number.isFinite(left)) return null
  return { ratio, left }
}

function drawInfo(
  ctx: CanvasRenderingContext2D,
  urgent: { ratio: number; left: number } | null,
  best: number,
  score: number,
  x: number,
  y: number
): void {
  ctx.textAlign = 'left'
  if (urgent) {
    const color = urgent.ratio < FUSE.CRITICAL_RATIO ? COLOR.danger : COLOR.accent
    ctx.fillStyle = color
    ctx.font = LABEL_BOLD
    const s = t()
    // 「残り 1.2 秒」も "1.2s left" も、数字を挟む形は同じ
    let cursor = x
    if (s.remainingPrefix) {
      ctx.fillText(s.remainingPrefix, cursor, y + 2)
      cursor += ctx.measureText(s.remainingPrefix).width + 6
    }
    drawPixelText(ctx, urgent.left.toFixed(1), cursor, y, 3, color)
    cursor += measurePixelText('0.0', 3) + 4
    ctx.fillStyle = color
    ctx.fillText(s.remainingSuffix, cursor, y + 2)
  } else if (best > score) {
    ctx.fillStyle = COLOR.textDim
    ctx.font = LABEL
    ctx.fillText(t().best, x, y + 2)
    drawPixelText(ctx, String(best), x + ctx.measureText(t().best).width + 6, y, 2, COLOR.textDim)
  } else if (best > 0) {
    ctx.fillStyle = COLOR.accent
    ctx.font = LABEL_BOLD
    ctx.fillText(t().newRecord, x, y + 2)
  }
}

function drawCombo(
  ctx: CanvasRenderingContext2D,
  w: World,
  right: number,
  y: number,
  dot: number
): void {
  const mult = comboMultiplier(w.combo)
  const multText = `x${mult.toFixed(1)}`
  const multW = measurePixelText(multText, dot)

  // 右から「x5.0」「連鎖」「12」の順に積む
  drawPixelText(ctx, multText, right, y, dot, COLOR.accent, 'right')

  ctx.textAlign = 'right'
  ctx.fillStyle = COLOR.accent
  ctx.font = '700 13px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  const wordRight = right - multW - 8
  ctx.fillText(t().chain, wordRight, y + pixelTextHeight(dot) - 3)
  drawPixelText(ctx, String(w.combo), wordRight - 30, y, dot, COLOR.accent, 'right')

  // 連鎖が切れるまでの残り。滑らかなバーではなくドットの目盛りで見せる
  const cells = 12
  const cell = 6
  const gap = 2
  const gw = cells * cell + (cells - 1) * gap
  const gx = right - gw
  const gy = y + pixelTextHeight(dot) + 6
  const ratio = clamp(w.comboTimer / SCORE.COMBO_WINDOW, 0, 1)
  const lit = Math.ceil(ratio * cells)
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < lit ? (ratio < 0.3 ? COLOR.danger : COLOR.accent) : 'rgba(255,255,255,0.13)'
    ctx.fillRect(gx + i * (cell + gap), gy, cell, 4)
  }
}
