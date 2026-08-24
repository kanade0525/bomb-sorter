import { FX } from '../core/constants'
import { clamp } from '../core/math'
import type { BombKind, Layout } from '../core/types'
import { COLOR, styleOf } from './palette'

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
  text: string
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
      color: i % 3 === 0 ? COLOR.accent : st.bodyLight,
      star: kind === 'round',
    })
  }
}

export function fxRing(fx: Fx, x: number, y: number, color: string): void {
  if (fx.rings.length >= FX.MAX_RINGS) fx.rings.shift()
  fx.rings.push({ x, y, life: 0.45, max: 0.45, color })
}

export function fxPop(fx: Fx, x: number, y: number, text: string, color: string, size = 16): void {
  if (fx.pops.length >= FX.MAX_POPS) fx.pops.shift()
  fx.pops.push({ x, y, life: 0.6, max: 0.6, text, color, size })
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
  for (const r of fx.rings) {
    const k = 1 - r.life / r.max
    const rad = 6 + k * 68
    ctx.strokeStyle = r.color
    ctx.globalAlpha = clamp(1 - k, 0, 1) * 0.8
    ctx.lineWidth = 3 * (1 - k) + 0.6
    ctx.beginPath()
    ctx.arc(r.x, r.y, rad, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  void layout
}

export function drawFxFront(ctx: CanvasRenderingContext2D, fx: Fx, layout: Layout): void {
  for (const p of fx.particles) {
    const k = clamp(p.life / p.max, 0, 1)
    ctx.globalAlpha = k
    ctx.fillStyle = p.color
    ctx.beginPath()
    if (p.star) {
      const s = p.size * (0.6 + k)
      ctx.moveTo(p.x, p.y - s)
      ctx.lineTo(p.x + s * 0.4, p.y)
      ctx.lineTo(p.x, p.y + s)
      ctx.lineTo(p.x - s * 0.4, p.y)
      ctx.closePath()
    } else {
      ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2)
    }
    ctx.fill()
  }

  for (const p of fx.pops) {
    const k = 1 - p.life / p.max
    ctx.globalAlpha = clamp(1 - k * k, 0, 1)
    ctx.font = `700 ${p.size}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 赤いボムの上でもゾーンの上でも読めるように、暗い縁取りを先に置く
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(13,15,20,0.9)'
    ctx.strokeText(p.text, p.x, p.y - k * 34)
    ctx.fillStyle = p.color
    ctx.fillText(p.text, p.x, p.y - k * 34)
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
