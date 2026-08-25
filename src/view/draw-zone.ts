import { BOMB, STORE } from '../core/constants'
import type { StoredBomb, Zone } from '../core/types'
import { drawBody } from './draw-bomb'
import { COLOR, styleOf } from './palette'

/**
 * 指が箱の上にあるときの状態。
 *
 * 'wrong' を 'match' と同じ見た目にしてはいけない。誤投入は即ゲームオーバーなので、
 * 「ここに落としてよい」に見える表示を出した時点で理不尽な死を招く。
 */
export type ZoneHover = 'none' | 'match' | 'wrong'

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
  const hovered = hover === 'match'
  const wrong = hover === 'wrong'

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

  if (wrong) {
    // 「今は閉じている」ことを面で示す。枠と × だけだと、指で隠れたときに伝わらない
    ctx.fillStyle = 'rgba(13,15,20,0.55)'
    ctx.fill()
  }

  // ---- 中身（仕分け済みのボム） ----
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, 10)
  ctx.clip()
  ctx.globalAlpha = wrong ? 0.35 : 1
  drawStored(ctx, zone, stored)
  ctx.globalAlpha = 1
  ctx.restore()

  // ---- 枠 ----
  ctx.lineWidth = hovered ? 4 : 2
  // 誤りのときは枠を沈ませて「引っ込む」印象にする。太くすると誘ってしまう
  ctx.strokeStyle = wrong ? COLOR.outline : st.binEdge
  ctx.setLineDash(hovered ? [12, 6] : [])
  ctx.lineDashOffset = hovered ? -t * 18 : 0
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, 10)
  ctx.stroke()
  ctx.setLineDash([])

  // ---- 誤りのときの × ----
  // 掴んでいるボムと指の下に隠れないよう、箱いっぱいに広げる
  if (wrong) {
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const k = Math.min(r.w, r.h) * 0.34
    ctx.strokeStyle = COLOR.reject
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - k, cy - k)
    ctx.lineTo(cx + k, cy + k)
    ctx.moveTo(cx + k, cy - k)
    ctx.lineTo(cx - k, cy + k)
    ctx.stroke()
  }

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
