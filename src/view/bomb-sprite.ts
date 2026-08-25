import { BOMB } from '../core/constants'
import type { BombKind } from '../core/types'
import { styleOf } from './palette'

/**
 * ボムすけの姿を 1 枚に焼いておく置き場。
 *
 * 本体は 1 ドットずつ塗って描いていて、1 体あたり 150 回近い塗りになる。
 * フィールドのボムだけなら気にならないが、箱が埋まると中身が 88 体になり、
 * 毎フレーム 1 万回を超える塗りが走る。実測で、CPU を 8 倍抑制した端末では
 * 16 fps まで落ちた。
 *
 * 姿は「色 × 足の位相 × 目線」の組み合わせしかないので、その数だけ焼いておいて
 * あとは貼るだけにする。ドットの目を保つため、焼くときは実解像度
 * （論理サイズ × dpr × 拡大率）で描く。
 */

/** 本体の半径（ドット数） */
const BODY_R = 6
/** 足の付け根から下の高さ（ドット） */
const LEG_H = 4
/** 焼く範囲。足が振れる分と火花の分だけ本体より広く取る */
const PAD = 2
const W_DOTS = (BODY_R + PAD) * 2 + 1
const H_DOTS = BODY_R + PAD + (BODY_R + LEG_H + PAD) + 1

/** 足の振れ幅。掴んでいるときも同じ枚数で済ませる */
export const LEG_FRAMES = [-1, 0, 1] as const
export type LegFrame = (typeof LEG_FRAMES)[number]
export type LookFrame = 0 | 1

export interface SpriteBox {
  canvas: HTMLCanvasElement
  /** 論理単位での大きさと、中心からの左上のずれ */
  w: number
  h: number
  ox: number
  oy: number
}

const cache = new Map<string, SpriteBox>()

/** 本体の 1 ドットが、輪郭・ハイライト・影・地色のどれかを返す */
function bodyShade(dx: number, dy: number): 'edge' | 'light' | 'shade' | 'body' | null {
  const d2 = dx * dx + dy * dy
  const r2 = BODY_R * BODY_R
  if (d2 > r2) return null
  const outside = (ax: number, ay: number) => ax * ax + ay * ay > r2
  if (outside(dx + 1, dy) || outside(dx - 1, dy) || outside(dx, dy + 1) || outside(dx, dy - 1)) {
    return 'edge'
  }
  if (dx <= -1 && dy <= -2 && dx >= -3) return 'light'
  if (dx + dy > 4) return 'shade'
  return 'body'
}

/**
 * 焼いた姿を取り出す。無ければその場で焼く。
 * device は「論理 1px が実ピクセル何個か」（dpr × 拡大率）。
 */
export function getBombSprite(
  kind: BombKind,
  leg: LegFrame,
  look: LookFrame,
  p: number,
  device: number
): SpriteBox | null {
  // 実解像度が半端に動くとキャッシュが増え続けるので、少し丸めて刻みを粗くする
  const dev = Math.max(0.5, Math.round(device * 4) / 4)
  const key = `${kind}|${leg}|${look}|${p}|${dev}`
  const hit = cache.get(key)
  if (hit) return hit

  const w = W_DOTS * p
  const h = H_DOTS * p
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w * dev))
  canvas.height = Math.max(1, Math.ceil(h * dev))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dev, 0, 0, dev, 0, 0)

  // 中心が (BODY_R + PAD, BODY_R + PAD) ドットの位置に来るように描く
  const cx = (BODY_R + PAD) * p
  const cy = (BODY_R + PAD) * p
  const dot = (x: number, y: number, dw = 1, dh = 1) =>
    ctx.fillRect(cx + x * p, cy + y * p, dw * p, dh * p)

  const st = styleOf(kind)

  // ---- 足（本体の後ろ） ----
  for (const [lx, off] of [
    [-3, leg],
    [1, -leg],
  ] as const) {
    ctx.fillStyle = '#3d4354'
    dot(lx, BODY_R - 1 + off, 2, LEG_H)
    ctx.fillStyle = '#5f687e'
    dot(lx, BODY_R - 1 + off + LEG_H - 1, 3, 1)
  }

  // ---- 本体 ----
  for (let dy = -BODY_R; dy <= BODY_R; dy++) {
    for (let dx = -BODY_R; dx <= BODY_R; dx++) {
      const shade = bodyShade(dx, dy)
      if (!shade) continue
      ctx.fillStyle =
        shade === 'edge'
          ? st.edge
          : shade === 'light'
            ? st.light
            : shade === 'shade'
              ? st.shade
              : st.body
      dot(dx, dy)
    }
  }

  // ---- 目 ----
  ctx.fillStyle = '#f4f6fa'
  dot(-3, -2, 2, 2)
  dot(1, -2, 2, 2)
  ctx.fillStyle = '#14161c'
  dot(-2 + look, -1)
  dot(2 + look, -1)

  const box: SpriteBox = { canvas, w, h, ox: -cx, oy: -cy }
  cache.set(key, box)
  return box
}

/** 拡大率や端末が変わったら焼き直す。古い解像度のまま貼るとドットが甘くなる */
export function clearBombSprites(): void {
  cache.clear()
}

/** 足の位相と目線を、焼いてある枚数に丸める */
export function legFrameOf(step: number): LegFrame {
  const v = Math.round(Math.sin(step))
  return (v < 0 ? -1 : v > 0 ? 1 : 0) as LegFrame
}

export function lookFrameOf(step: number): LookFrame {
  return Math.sin(step * 0.5) > 0.5 ? 1 : 0
}

export { BODY_R, LEG_H }
void BOMB
