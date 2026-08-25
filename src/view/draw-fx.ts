import { BOMB, FX } from '../core/constants'
import { clamp } from '../core/math'
import type { BombKind, Layout } from '../core/types'
import { COLOR, styleOf } from './palette'
import { drawPixelTextShadow, measurePixelText, pixelTextHeight } from './pixel-font'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  star: boolean
}

interface Ring {
  x: number
  y: number
  life: number
  max: number
  color: string
}

interface Pop {
  x: number
  y: number
  life: number
  max: number
  /** ドット字形で描く部分。数字と記号だけ */
  text: string
  /** 添える言葉。システムフォントで描く。無くてもよい */
  word?: string
  color: string
  size: number
}

export interface Fx {
  particles: Particle[]
  rings: Ring[]
  pops: Pop[]
  shake: number
  flash: number
  vignette: number
  /** 演出用の時刻。乱数を使わず sin で揺らすために持つ */
  t: number
}

export function createFx(): Fx {
  return { particles: [], rings: [], pops: [], shake: 0, flash: 0, vignette: 0, t: 0 }
}

export function fxBurst(fx: Fx, x: number, y: number, kind: BombKind, count: number): void {
  const st = styleOf(kind)
  for (let i = 0; i < count; i++) {
    if (fx.particles.length >= FX.MAX_PARTICLES) break
    const a = (i / count) * Math.PI * 2 + fx.t
    const sp = 70 + ((i * 37) % 90)
    const max = 0.35 + ((i * 13) % 40) / 100
    fx.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: max,
      max,
      size: 2 + ((i * 7) % 3),
      color: i % 3 === 0 ? COLOR.accent : st.light,
      star: kind === 'red',
    })
  }
}

export function fxRing(fx: Fx, x: number, y: number, color: string): void {
  if (fx.rings.length >= FX.MAX_RINGS) fx.rings.shift()
  fx.rings.push({ x, y, life: 0.45, max: 0.45, color })
}

export function fxPop(
  fx: Fx,
  x: number,
  y: number,
  text: string,
  color: string,
  size = 16,
  word?: string
): void {
  if (fx.pops.length >= FX.MAX_POPS) fx.pops.shift()
  const pop: Pop = { x, y, life: 0.6, max: 0.6, text, color, size }
  if (word !== undefined) pop.word = word
  fx.pops.push(pop)
}

export function fxShake(fx: Fx, amount: number): void {
  fx.shake = Math.max(fx.shake, amount)
}

export function fxMiss(fx: Fx, x: number, y: number, kind: BombKind, reduced: boolean): void {
  fxBurst(fx, x, y, kind, reduced ? FX.PARTICLES_MISS_REDUCED : FX.PARTICLES_MISS)
  fxRing(fx, x, y, COLOR.danger)
  fx.vignette = 1
  if (!reduced) {
    fx.flash = 1
    fxShake(fx, FX.SHAKE_MISS)
  }
}

export function updateFx(fx: Fx, dt: number): void {
  fx.t += dt

  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i]
    if (!p) continue
    p.life -= dt
    if (p.life <= 0) {
      fx.particles.splice(i, 1)
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 220 * dt
    p.vx *= 1 - 1.6 * dt
  }

  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const r = fx.rings[i]
    if (!r) continue
    r.life -= dt
    if (r.life <= 0) fx.rings.splice(i, 1)
  }

  for (let i = fx.pops.length - 1; i >= 0; i--) {
    const p = fx.pops[i]
    if (!p) continue
    p.life -= dt
    if (p.life <= 0) fx.pops.splice(i, 1)
  }

  fx.shake = Math.max(0, fx.shake - FX.SHAKE_DECAY * dt * (1 + fx.shake * 0.2))
  fx.flash = Math.max(0, fx.flash - dt * 22)
  fx.vignette = Math.max(0, fx.vignette - dt * 2.5)
}

/** 画面シェイクの変位。乱数を使わず時刻から決めるのでリプレイしても同じ揺れになる */
export function shakeOffset(fx: Fx): { x: number; y: number } {
  if (fx.shake <= 0.01) return { x: 0, y: 0 }
  return {
    x: Math.sin(fx.t * 63) * fx.shake,
    y: Math.cos(fx.t * 71) * fx.shake * 0.7,
  }
}

export function drawFxBack(ctx: CanvasRenderingContext2D, fx: Fx, layout: Layout): void {
  // 円ではなくドットを円周上に並べる。線を引くと目が滑らかになって浮く
  const D = BOMB.PIXEL
  for (const r of fx.rings) {
    const k = 1 - r.life / r.max
    const rad = 6 + k * 64
    ctx.fillStyle = r.color
    ctx.globalAlpha = clamp(1 - k, 0, 1) * 0.85
    const count = Math.max(8, Math.round(rad / 3))
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const px = Math.round((r.x + Math.cos(a) * rad) / D) * D
      const py = Math.round((r.y + Math.sin(a) * rad) / D) * D
      ctx.fillRect(px, py, D, D)
    }
  }
  ctx.globalAlpha = 1
  void layout
}

export function drawFxFront(ctx: CanvasRenderingContext2D, fx: Fx, layout: Layout): void {
  // 破片は丸ではなく四角いドット。座標もドットの目に載せる
  const D = BOMB.PIXEL
  for (const p of fx.particles) {
    const k = clamp(p.life / p.max, 0, 1)
    ctx.globalAlpha = k
    ctx.fillStyle = p.color
    const n = Math.max(1, Math.round(p.size * (0.4 + k) * 0.6))
    const sz = n * D
    ctx.fillRect(Math.round(p.x / D) * D - sz / 2, Math.round(p.y / D) * D - sz / 2, sz, sz)
  }

  for (const p of fx.pops) {
    const k = 1 - p.life / p.max
    ctx.globalAlpha = clamp(1 - k * k, 0, 1)
    const dot = Math.max(2, Math.round(p.size / 6))
    const y = p.y - k * 34 - pixelTextHeight(dot) / 2
    if (p.word) {
      // 言葉つきのポップは、数字だけドットで組んで言葉はシステムフォントに任せる
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // 幅を測る前にフォントを決めること。順序を逆にすると、
      // 直前に誰かが設定したフォントの幅で位置が決まってしまう
      ctx.font = `700 ${p.size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`
      const wordW = ctx.measureText(p.word).width
      drawPixelTextShadow(ctx, p.text, p.x - wordW / 2 - 3, y, dot, p.color, 'center')
      ctx.fillStyle = p.color
      ctx.font = `700 ${p.size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`
      ctx.fillText(
        p.word,
        p.x + measurePixelText(p.text, dot) / 2 + 3,
        y + pixelTextHeight(dot) / 2
      )
    } else {
      drawPixelTextShadow(ctx, p.text, p.x, y, dot, p.color, 'center')
    }
  }

  ctx.globalAlpha = 1

  if (fx.vignette > 0.001) {
    const g = ctx.createRadialGradient(
      layout.logicalW / 2,
      layout.logicalH / 2,
      layout.logicalW * 0.28,
      layout.logicalW / 2,
      layout.logicalH / 2,
      layout.logicalW * 0.86
    )
    g.addColorStop(0, 'rgba(255,60,50,0)')
    g.addColorStop(1, `rgba(255,60,50,${(0.5 * fx.vignette).toFixed(3)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, layout.logicalW, layout.logicalH)
  }

  if (fx.flash > 0.001) {
    ctx.fillStyle = `rgba(255,255,255,${(0.8 * fx.flash).toFixed(3)})`
    ctx.fillRect(0, 0, layout.logicalW, layout.logicalH)
  }
}
