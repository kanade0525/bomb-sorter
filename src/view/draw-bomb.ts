import { BOMB, FUSE } from '../core/constants'
import { clamp } from '../core/math'
import type { Bomb } from '../core/types'
import { styleOf } from './palette'

export interface DrawFlags {
  reducedMotion: boolean
  /** タイトルの飾りのボムは導火線が止まっているので、ゲージを出すと嘘になる */
  showFuse?: boolean
}

function roundedSquarePath(ctx: CanvasRenderingContext2D, r: number): void {
  const s = r * 0.92
  ctx.beginPath()
  ctx.roundRect(-s, -s, s * 2, s * 2, 8)
}

function circlePath(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
}

/**
 * ボム 1 個を描く。
 *
 * round と square は色以外に「シルエット・中央の刻印・導火線の向き」で違うので、
 * 白黒に印刷しても、色が見分けられなくても判別できる。
 * shadowBlur は使わない（モバイルで致命的に重い）。光は放射グラデーションで表現する。
 */
export function drawBomb(ctx: CanvasRenderingContext2D, b: Bomb, flags: DrawFlags): void {
  const ratio = b.fuseMax > 0 ? clamp(b.fuse / b.fuseMax, 0, 1) : 1
  const st = styleOf(b.kind)
  const isRound = b.kind === 'round'

  // 警告時の鼓動。動きを抑える設定のときは拡縮せず、残量アークを太くして静的に強調する
  let pulse = 1
  if (!flags.reducedMotion) {
    if (ratio < FUSE.CRITICAL_RATIO) pulse = 1 + 0.075 * (0.5 + 0.5 * Math.sin(b.wobble * 5))
    else if (ratio < FUSE.WARN_RATIO) pulse = 1 + 0.05 * (0.5 + 0.5 * Math.sin(b.wobble * 2.6))
  }
  const vanishScale = b.vanish > 0 ? clamp(1 - b.vanish, 0, 1) : 1
  const wobbleAmp = flags.reducedMotion ? BOMB.WOBBLE_AMP / 3 : BOMB.WOBBLE_AMP
  const dx = Math.sin(b.wobble) * wobbleAmp * 0.35
  const dy = Math.cos(b.wobble * 0.8) * wobbleAmp * 0.35

  ctx.save()
  ctx.translate(b.x + dx, b.y + dy)
  ctx.scale(pulse * vanishScale, pulse * vanishScale)
  if (b.vanish > 0) ctx.globalAlpha = clamp(1 - b.vanish, 0, 1)

  const r = BOMB.RADIUS

  // 本体
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
  g.addColorStop(0, st.bodyLight)
  g.addColorStop(1, st.body)
  ctx.fillStyle = g
  if (isRound) circlePath(ctx, r)
  else roundedSquarePath(ctx, r)
  ctx.fill()

  ctx.lineWidth = isRound ? 2 : 2.5
  ctx.strokeStyle = st.edge
  ctx.stroke()

  // 中央の刻印。round は菱形、square は横並びの 2 点
  ctx.fillStyle = st.mark
  if (isRound) {
    const m = r * 0.34
    ctx.beginPath()
    ctx.moveTo(0, -m)
    ctx.lineTo(m, 0)
    ctx.lineTo(0, m)
    ctx.lineTo(-m, 0)
    ctx.closePath()
    ctx.fill()
  } else {
    const m = r * 0.26
    ctx.beginPath()
    ctx.arc(-m, 0, r * 0.15, 0, Math.PI * 2)
    ctx.arc(m, 0, r * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }

  // 残量アーク。角度で読めるので色に依存しない
  const showFuse = flags.showFuse !== false
  const arcW = flags.reducedMotion ? 7 : 4
  if (showFuse) {
    ctx.lineWidth = arcW
    ctx.lineCap = 'butt'
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.arc(0, 0, r + arcW, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle =
      ratio < FUSE.CRITICAL_RATIO ? '#ff5d52' : ratio < FUSE.WARN_RATIO ? '#ffb03a' : '#8ce99a'
    ctx.beginPath()
    ctx.arc(0, 0, r + arcW, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio)
    ctx.stroke()
  }

  // 導火線。物理的に短くなるので、残量が形でも分かる
  const angle = isRound ? -Math.PI / 4 : -Math.PI / 2
  const baseX = Math.cos(angle) * r * 0.86
  const baseY = Math.sin(angle) * r * 0.86
  const len = r * 0.75 * (0.25 + 0.75 * ratio)
  const tipX = baseX + Math.cos(angle) * len
  const tipY = baseY + Math.sin(angle) * len

  ctx.lineCap = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#c8b18a'
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.quadraticCurveTo(
    baseX + Math.cos(angle) * len * 0.6 + 4,
    baseY + Math.sin(angle) * len * 0.6,
    tipX,
    tipY
  )
  ctx.stroke()

  // 火花。round は星、square は丸で、ここでも形の差を付ける
  const spark = flags.reducedMotion ? 0.9 : 0.7 + 0.3 * Math.sin(b.wobble * 9)
  ctx.fillStyle = ratio < FUSE.CRITICAL_RATIO ? '#ff5d52' : '#ffd166'
  if (isRound) {
    const k = 3.2 * spark
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const rad = i % 2 === 0 ? k * 1.8 : k * 0.7
      const px = tipX + Math.cos(a) * rad
      const py = tipY + Math.sin(a) * rad
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.arc(tipX, tipY, 3.4 * spark, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
