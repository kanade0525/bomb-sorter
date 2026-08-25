import { BOMB, FUSE } from '../core/constants'
import { clamp } from '../core/math'
import type { Bomb, BombKind } from '../core/types'
import { getBombSprite, legFrameOf, lookFrameOf } from './bomb-sprite'
import { COLOR } from './palette'

export interface DrawFlags {
  reducedMotion: boolean
  /** 論理 1px が実ピクセル何個か。焼いた姿をドットの目を保って貼るのに要る */
  device: number
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

type Ctx = CanvasRenderingContext2D

/** 本体の半径（ドット数）。導火線と残量ゲージの位置決めに使う */
const BODY_R = 6

/** ドット 1 個を置く。座標はドット単位で、p が 1 ドットの大きさ */
function dot(ctx: Ctx, px: number, py: number, p: number, w = 1, h = 1): void {
  ctx.fillRect(px * p, py * p, w * p, h * p)
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

  drawBody(ctx, b.kind, b.step, BOMB.PIXEL, flags.device)
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

/**
 * 本体と足。焼いてある姿を貼るだけ。
 *
 * 以前はここで 1 ドットずつ塗っていたが、箱が埋まると中身が 88 体になり、
 * 毎フレーム 1 万回を超える塗りになって、遅い端末で 16 fps まで落ちた。
 * 姿の種類は「色 × 足の位相 × 目線」しかないので、焼いておいて貼る。
 *
 * device は「論理 1px が実ピクセル何個か」。ドットの目を保つために必要で、
 * 呼び出し側（renderer）が現在のビューポートから渡す。
 */
export function drawBody(
  ctx: Ctx,
  kind: BombKind,
  step: number,
  p: number,
  device: number,
  alpha = 1
): void {
  const sprite = getBombSprite(kind, legFrameOf(step), lookFrameOf(step), p, device)
  if (!sprite) return
  const prev = ctx.globalAlpha
  if (alpha !== 1) ctx.globalAlpha = prev * alpha
  ctx.drawImage(sprite.canvas, sprite.ox, sprite.oy, sprite.w, sprite.h)
  ctx.globalAlpha = prev
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
