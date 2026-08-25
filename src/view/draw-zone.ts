import { BOMB, STORE } from '../core/constants'
import type { Rect, StoredBomb, Zone } from '../core/types'
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

  const D = BOMB.PIXEL
  ctx.save()

  // ---- 箱本体 ----
  // 角丸をやめて、ドット 1 個ぶんずつ削った段差の角にする。
  // 曲線が 1 か所でも混じると、まわりのドットの目から浮いて見える
  binPath(ctx, r, D)
  ctx.fillStyle = st.binFill
  ctx.fill()

  if (hovered) {
    // どこに入るかを常に見せる。グローは放射グラデーションで作る（shadowBlur は使わない）
    // グラデーションは目が滑らかになるので、内側にもう一枚重ねて明るくする
    ctx.fillStyle = st.binFill
    ctx.fill()
  }

  // ---- 中身（仕分け済みのボム） ----
  ctx.save()
  binPath(ctx, r, D)
  ctx.clip()
  drawStored(ctx, zone, stored)
  ctx.restore()

  // ---- 枠 ----
  // 線を引かず、ドットを縁に沿って並べる。ホバー中は流れる点線にする
  drawPixelBorder(ctx, r, D, st.binEdge, hovered, t)

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

/** 角をドット 1 個ぶんずつ削った矩形。曲線を使わない角丸 */
function binPath(ctx: CanvasRenderingContext2D, r: Rect, d: number): void {
  const c = d * 2
  ctx.beginPath()
  ctx.moveTo(r.x + c, r.y)
  ctx.lineTo(r.x + r.w - c, r.y)
  ctx.lineTo(r.x + r.w - d, r.y + d)
  ctx.lineTo(r.x + r.w, r.y + c)
  ctx.lineTo(r.x + r.w, r.y + r.h - c)
  ctx.lineTo(r.x + r.w - d, r.y + r.h - d)
  ctx.lineTo(r.x + r.w - c, r.y + r.h)
  ctx.lineTo(r.x + c, r.y + r.h)
  ctx.lineTo(r.x + d, r.y + r.h - d)
  ctx.lineTo(r.x, r.y + r.h - c)
  ctx.lineTo(r.x, r.y + c)
  ctx.lineTo(r.x + d, r.y + d)
  ctx.closePath()
}

/**
 * 縁にドットを並べる。ホバー中は 1 つおきに点灯させて流す。
 * 線幅で太らせるとドットの目が半端な位置に来るので、必ず d の倍数で置く。
 */
function drawPixelBorder(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  d: number,
  color: string,
  hovered: boolean,
  t: number
): void {
  const thick = hovered ? d : d / 2
  ctx.fillStyle = color
  const march = Math.floor(t * 12)
  const on = (i: number) => !hovered || (i + march) % 4 < 3

  const cols = Math.ceil(r.w / d)
  for (let i = 0; i < cols; i++) {
    if (!on(i)) continue
    const x = r.x + i * d
    ctx.fillRect(x, r.y, d, thick)
    ctx.fillRect(x, r.y + r.h - thick, d, thick)
  }
  const rows = Math.ceil(r.h / d)
  for (let i = 0; i < rows; i++) {
    if (!on(i + cols)) continue
    const y = r.y + i * d
    ctx.fillRect(r.x, y, thick, d)
    ctx.fillRect(r.x + r.w - thick, y, thick, d)
  }
}
