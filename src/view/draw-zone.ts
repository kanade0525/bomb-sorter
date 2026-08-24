import { BOMB } from '../core/constants'
import type { Zone } from '../core/types'
import { COLOR, styleOf } from './palette'

/**
 * 仕分けエリア。
 * 「色面」「大きな形アイコン」「かなのラベル」の 3 つを必ず並べるので、
 * 色が見分けられなくても形で、形が分からなくても文字で、どちらに入れるかが分かる。
 */
export function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: Zone,
  hovered: boolean,
  t: number
): void {
  const st = styleOf(zone.kind)
  const r = zone.rect
  const isRound = zone.kind === 'round'
  const lift = hovered ? 2 : 0
  const y = r.y - lift

  ctx.save()

  // 枠の丸みでも形の違いを出す
  const corner = isRound ? 32 : 6

  ctx.beginPath()
  ctx.roundRect(r.x, y, r.w, r.h, corner)
  ctx.fillStyle = st.zoneFill
  ctx.fill()

  if (hovered) {
    // どこに入るかを常に見せる。グローは放射グラデーションで作る（shadowBlur は使わない）
    const g = ctx.createRadialGradient(
      r.x + r.w / 2,
      y + r.h / 2,
      4,
      r.x + r.w / 2,
      y + r.h / 2,
      r.w * 0.75
    )
    g.addColorStop(0, st.zoneFill)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fill()
  }

  ctx.lineWidth = hovered ? 4 : 2
  ctx.strokeStyle = st.zoneEdge
  ctx.setLineDash(isRound ? [10, 7] : [])
  ctx.lineDashOffset = isRound ? -t * 14 : 0
  ctx.stroke()
  ctx.setLineDash([])

  // 形アイコン
  const cx = zone.iconCenter.x
  const cy = zone.iconCenter.y - lift
  const size = BOMB.RADIUS * (hovered ? 1.08 : 1) * 0.86
  ctx.fillStyle = st.body
  ctx.strokeStyle = st.zoneEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  if (isRound) ctx.arc(cx, cy, size, 0, Math.PI * 2)
  else ctx.roundRect(cx - size, cy - size, size * 2, size * 2, 7)
  ctx.fill()
  ctx.stroke()

  // 刻印（ボム本体と同じ記号にして対応関係を示す）
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  if (isRound) {
    const m = size * 0.34
    ctx.beginPath()
    ctx.moveTo(cx, cy - m)
    ctx.lineTo(cx + m, cy)
    ctx.lineTo(cx, cy + m)
    ctx.lineTo(cx - m, cy)
    ctx.closePath()
    ctx.fill()
  } else {
    const m = size * 0.26
    ctx.beginPath()
    ctx.arc(cx - m, cy, size * 0.15, 0, Math.PI * 2)
    ctx.arc(cx + m, cy, size * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }

  // ラベル
  ctx.fillStyle = hovered ? COLOR.text : COLOR.textDim
  ctx.font = '700 15px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(st.label, cx, y + r.h - 22)

  ctx.restore()
}
