import { TIMING } from '../core/constants'
import { zoneAt } from '../game/hittest'
import type { BombKind, World } from '../core/types'
import { drawBomb, type DrawFlags } from './draw-bomb'
import { drawFxBack, drawFxFront, shakeOffset, type Fx } from './draw-fx'
import { drawHud } from './draw-hud'
import { drawZone, type ZoneHover } from './draw-zone'
import { COLOR } from './palette'
import { applyTransform, type Viewport } from './viewport'

export interface RenderInput {
  world: World
  fx: Fx
  vp: Viewport
  flags: DrawFlags
  best: number
  /** 経過時刻。破線のアニメなど、ゲーム状態に影響しない演出に使う */
  t: number
}

export function render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { world, fx, vp, flags, best, t } = input
  const layout = vp.layout

  // レターボックス部分を含めて全面を塗る
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = COLOR.bgDeep
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  applyTransform(ctx, vp)
  const sh = shakeOffset(fx)
  if (sh.x !== 0 || sh.y !== 0) ctx.translate(sh.x, sh.y)

  // 背景
  ctx.fillStyle = COLOR.bg
  ctx.fillRect(0, 0, layout.logicalW, layout.logicalH)

  // フィールドの枠。ボムが漂える範囲を示す
  const f = layout.field
  ctx.strokeStyle = COLOR.fieldEdge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(f.x, f.y, f.w, f.h, 14)
  ctx.stroke()

  // どのゾーンの上に指があるか。掴んでいるボムの中心で判定し、
  // 形が合っているかどうかまで見る（合っていないゾーンを強調すると誤投入へ誘ってしまう）
  const hover = new Map<BombKind, ZoneHover>()
  for (const b of world.bombs) {
    if (b.grabbedBy === null) continue
    const z = zoneAt(layout, b.x, b.y)
    if (!z) continue
    const next: ZoneHover = z.kind === b.kind ? 'match' : 'wrong'
    // 2 本指で片方が正解なら正解を優先して見せる
    if (next === 'match' || !hover.has(z.kind)) hover.set(z.kind, next)
  }
  for (const z of layout.zones) drawZone(ctx, z, hover.get(z.kind) ?? 'none', t)

  drawFxBack(ctx, fx, layout)

  // タイトルでは飾りなので、導火線ゲージを出さず薄く描いて文字の邪魔をしない
  const isTitle = world.phase === 'title'
  const bombFlags: DrawFlags = isTitle
    ? { reducedMotion: flags.reducedMotion, showFuse: false }
    : flags
  if (isTitle) ctx.globalAlpha = 0.45
  for (const b of world.bombs) drawBomb(ctx, b, bombFlags)
  ctx.globalAlpha = 1

  drawFxFront(ctx, fx, layout)

  if (world.phase !== 'title') drawHud(ctx, world, layout, best)

  if (world.phase === 'ready') drawReady(ctx, world.phaseTime, layout.logicalW, layout.logicalH)
}

function drawReady(ctx: CanvasRenderingContext2D, phaseTime: number, w: number, h: number): void {
  const left = Math.max(0, TIMING.READY_SEC - phaseTime)
  const n = Math.ceil(left)
  const frac = 1 - (left - Math.floor(left))

  ctx.save()
  ctx.fillStyle = 'rgba(13,15,20,0.55)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 0.4 + 0.6 * (1 - frac)
  ctx.fillStyle = COLOR.text
  ctx.font = '700 92px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(String(Math.max(1, n)), w / 2, h / 2 - 10)
  ctx.globalAlpha = 1
  ctx.fillStyle = COLOR.textDim
  ctx.font = '600 14px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.fillText('おなじ かたちの ばしょへ はこぶ', w / 2, h / 2 + 56)
  ctx.restore()
}
