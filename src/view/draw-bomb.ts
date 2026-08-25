import { BOMB, FUSE } from '../core/constants'
import { clamp } from '../core/math'
import type { Bomb, BombKind } from '../core/types'
import { COLOR, styleOf } from './palette'

export interface DrawFlags {
  reducedMotion: boolean
  /** タイトルの飾りのボムは導火線が止まっているので、ゲージを出すと嘘になる */
  showFuse?: boolean
}

/**
 * ボムのピクセルアート。
 *
 * 2 種類とも形は完全に同じで、違うのは色だけ。丸や四角の描き分けをやめた代わりに、
 * 赤と黒という明度差の大きい組み合わせにしてあるので、グレースケールでも
 * 明るい方と暗い方で判別できる。
 *
 * 図形を 1 ドットずつ塗って描く。アンチエイリアスを避けたいので、
 * 座標はドット単位に丸めてから矩形で置いていく。shadowBlur は使わない。
 */

/** 本体の半径（ドット数）。PIXEL 倍したものが論理サイズになる */
const BODY_R = 6
/** 足の付け根から下の高さ（ドット） */
const LEG_H = 4

type Ctx = CanvasRenderingContext2D

function dot(ctx: Ctx, px: number, py: number, p: number, w = 1, h = 1): void {
  ctx.fillRect(px * p, py * p, w * p, h * p)
}

/** 本体の 1 ドットが、輪郭・ハイライト・影・地色のどれかを返す */
function bodyShade(dx: number, dy: number): 'edge' | 'light' | 'shade' | 'body' | null {
  const d2 = dx * dx + dy * dy
  const r2 = BODY_R * BODY_R
  if (d2 > r2) return null
  // 外周 1 ドットを輪郭にする
  const outside = (ax: number, ay: number) => ax * ax + ay * ay > r2
  if (outside(dx + 1, dy) || outside(dx - 1, dy) || outside(dx, dy + 1) || outside(dx, dy - 1)) {
    return 'edge'
  }
  // 左上に小さな光沢、右下に影
  if (dx <= -1 && dy <= -2 && dx >= -3) return 'light'
  if (dx + dy > 4) return 'shade'
  return 'body'
}

export function drawBomb(ctx: Ctx, b: Bomb, flags: DrawFlags): void {
  const ratio = b.fuseMax > 0 ? clamp(b.fuse / b.fuseMax, 0, 1) : 1
  const held = b.grabbedBy !== null

  // 警告時の鼓動。動きを抑える設定のときは拡縮しない
  let pulse = 1
  if (!flags.reducedMotion) {
    if (ratio < FUSE.CRITICAL_RATIO) pulse = 1 + 0.08 * (0.5 + 0.5 * Math.sin(b.step * 1.8))
    else if (ratio < FUSE.WARN_RATIO) pulse = 1 + 0.05 * (0.5 + 0.5 * Math.sin(b.step))
  }
  const vanishScale = b.vanish > 0 ? clamp(1 - b.vanish, 0, 1) : 1
  const scale = pulse * vanishScale * (held ? 1.12 : 1)

  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.scale(scale * b.facing, scale)
  if (b.vanish > 0) ctx.globalAlpha = clamp(1 - b.vanish, 0, 1)

  drawBody(ctx, b.kind, b.step, BOMB.PIXEL, held)
  drawFuse(ctx, ratio, b.step, BOMB.PIXEL, flags)

  ctx.restore()

  if (flags.showFuse !== false) drawFuseGauge(ctx, b, ratio, flags)

  // 掴んでいる印。指からはみ出す位置に破線のリングを出す
  if (held) {
    ctx.save()
    ctx.strokeStyle = 'rgba(232,236,244,0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(b.x, b.y, BOMB.RADIUS + 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

/** 本体と足。よちよち歩きは、左右の足を交互に上下させて作る */
export function drawBody(
  ctx: Ctx,
  kind: BombKind,
  step: number,
  p: number,
  held = false,
  alpha = 1
): void {
  const st = styleOf(kind)
  ctx.globalAlpha = ctx.globalAlpha * alpha

  // ---- 足（本体の後ろに描く） ----
  // 掴まれている間は宙に浮いているので、足をばたつかせる
  const swing = Math.sin(step)
  const lift = held ? 1.6 : 1
  const legL = Math.round(swing * lift)
  const legR = Math.round(-swing * lift)

  // 足は本体と別の色にする。本体と同系色にすると、ひとつながりの尻尾に見えてしまう
  for (const [lx, off] of [
    [-3, legL],
    [1, legR],
  ] as const) {
    ctx.fillStyle = COLOR.leg
    dot(ctx, lx, BODY_R - 1 + off, p, 2, LEG_H)
    // 足の先。進む向きへ少し出す
    ctx.fillStyle = COLOR.legFoot
    dot(ctx, lx, BODY_R - 1 + off + LEG_H - 1, p, 3, 1)
  }

  // ---- 本体 ----
  for (let dy = -BODY_R; dy <= BODY_R; dy++) {
    for (let dx = -BODY_R; dx <= BODY_R; dx++) {
      const kindOf = bodyShade(dx, dy)
      if (!kindOf) continue
      ctx.fillStyle =
        kindOf === 'edge'
          ? st.edge
          : kindOf === 'light'
            ? st.light
            : kindOf === 'shade'
              ? st.shade
              : st.body
      dot(ctx, dx, dy, p)
    }
  }

  // ---- 目 ----
  // 白目 2 ドットに黒目 1 ドット。ここも 2 種類で完全に同じ
  ctx.fillStyle = '#f4f6fa'
  dot(ctx, -3, -2, p, 2, 2)
  dot(ctx, 1, -2, p, 2, 2)
  ctx.fillStyle = '#14161c'
  const look = Math.round(Math.sin(step * 0.5) * 0.5)
  dot(ctx, -2 + look, -1, p)
  dot(ctx, 2 + look, -1, p)

  ctx.globalAlpha = ctx.globalAlpha / alpha
}

/** 導火線。残り時間に応じて物理的に短くなる */
function drawFuse(ctx: Ctx, ratio: number, step: number, p: number, flags: DrawFlags): void {
  const len = Math.max(1, Math.round(1 + 3 * ratio))
  ctx.fillStyle = '#c8b18a'
  for (let i = 0; i < len; i++) {
    dot(ctx, 1 + i, -BODY_R - 1 - i, p)
  }
  // 火花。残りわずかなら速く明滅する
  const speed = ratio < FUSE.CRITICAL_RATIO ? 9 : 4
  const on = flags.reducedMotion || Math.sin(step * speed) > -0.3
  if (on) {
    ctx.fillStyle = ratio < FUSE.CRITICAL_RATIO ? COLOR.danger : COLOR.accent
    dot(ctx, 1 + len, -BODY_R - 1 - len, p, 2, 2)
  }
}

/**
 * 残り時間のドットゲージ。本体の上に置く。
 *
 * 色だけの表現にしないため、点灯しているドットの「数」で残量を示す。
 * 色が見分けられなくても、いくつ残っているかは数えられる。
 */
function drawFuseGauge(ctx: Ctx, b: Bomb, ratio: number, flags: DrawFlags): void {
  const p = BOMB.PIXEL
  const n = FUSE.GAUGE_DOTS
  const lit = Math.ceil(ratio * n)
  const w = p * 1.4
  const gap = p * 0.5
  const total = n * w + (n - 1) * gap
  const x0 = b.x - total / 2
  const y = b.y - BOMB.RADIUS - p * 2.6
  const color =
    ratio < FUSE.CRITICAL_RATIO ? COLOR.danger : ratio < FUSE.WARN_RATIO ? '#ffb03a' : '#8ce99a'

  // 残りわずかのときは点滅させる（動きを抑える設定では点滅しない）
  const blink = !flags.reducedMotion && ratio < FUSE.CRITICAL_RATIO && Math.sin(b.step * 8) < 0

  ctx.save()
  for (let i = 0; i < n; i++) {
    const on = i < lit
    ctx.fillStyle = on ? (blink ? '#5a2320' : color) : 'rgba(255,255,255,0.13)'
    ctx.fillRect(x0 + i * (w + gap), y, w, p * 1.2)
  }
  ctx.restore()
}
