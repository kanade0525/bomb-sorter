import { BOMB, STORE } from '../core/constants'
import type { StoredBomb, Zone } from '../core/types'
import { drawBody } from './draw-bomb'
import { styleOf } from './palette'

/**
 * 指が箱の上にあるときの状態。
 *
 * 色が合っているかどうかで見た目を変えない。以前は誤りの箱に × を重ねていたが、
 * それだと落とす前に「やば、こっちじゃない」と気づけてしまい、
 * 慌てて間違える瞬間そのものが無くなる。パニックゲームとして、
 * 「どこに落ちるか」だけを見せて「合っているか」は見せない。
 */
export type ZoneHover = 'none' | 'hover'

/**
 * 仕分け先の箱。
 *
 * 文字のラベルは置かない。代わりに、これまで入れたボムが箱の中に残って
 * 歩き回っているので、どちらの箱かはその中身そのものが示す。
 * 仕分けた成果が数字ではなく目に見えて溜まっていく。
 */
export function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: Zone,
  stored: readonly StoredBomb[],
  hover: ZoneHover,
  t: number
): void {
  const st = styleOf(zone.kind)
  const r = zone.rect
  const hovered = hover === 'hover'

  ctx.save()

  // ---- 箱本体 ----
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, 10)
  ctx.fillStyle = st.binFill
  ctx.fill()

  if (hovered) {
    // どこに入るかを常に見せる。グローは放射グラデーションで作る（shadowBlur は使わない）
    const g = ctx.createRadialGradient(
      r.x + r.w / 2,
      r.y + r.h / 2,
      6,
      r.x + r.w / 2,
      r.y + r.h / 2,
      r.h * 0.7
    )
    g.addColorStop(0, st.binFill)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fill()
  }

  // ---- 中身（仕分け済みのボム） ----
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, 10)
  ctx.clip()
  drawStored(ctx, zone, stored)
  ctx.restore()

  // ---- 枠 ----
  ctx.lineWidth = hovered ? 4 : 2
  ctx.strokeStyle = st.binEdge
  ctx.setLineDash(hovered ? [12, 6] : [])
  ctx.lineDashOffset = hovered ? -t * 18 : 0
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, 10)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.restore()
}

/** 箱の中でうろうろしているボムたち */
function drawStored(
  ctx: CanvasRenderingContext2D,
  zone: Zone,
  stored: readonly StoredBomb[]
): void {
  const inner = zone.inner
  const p = BOMB.PIXEL * STORE.SCALE

  // 奥にいるもの（v が小さい）から描いて、手前が上に来るようにする
  const sorted = [...stored].sort((a, b) => a.v - b.v)
  for (const s of sorted) {
    const x = inner.x + inner.w * s.u
    const y = inner.y + inner.h * s.v
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s.facing, 1)
    drawBody(ctx, s.kind, s.step, p, false, 0.95)
    ctx.restore()
  }
}

/** 空の箱に出す控えめな案内。中身がまだ無いときだけ */
export function drawEmptyHint(ctx: CanvasRenderingContext2D, zone: Zone, t: number): void {
  const st = styleOf(zone.kind)
  const cx = zone.rect.x + zone.rect.w / 2
  const cy = zone.rect.y + zone.rect.h / 2
  ctx.save()
  ctx.globalAlpha = 0.32 + 0.08 * Math.sin(t * 2)
  ctx.translate(cx, cy)
  drawBody(ctx, zone.kind, 0, BOMB.PIXEL * 0.9)
  ctx.restore()
  void st
}
