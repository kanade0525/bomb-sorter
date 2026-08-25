import { FIELD } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout } from '../core/types'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Fit {
  logicalW: number
  logicalH: number
  /** 論理 1px が CSS 何 px になるか */
  scale: number
  offsetX: number
  offsetY: number
  /** 縦持ちかどうか。横持ち専用なので、縦なら回してもらう案内を出す */
  portrait: boolean
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * 画面サイズから論理解像度と拡大率を決める。
 *
 * 横持ち専用なので、短い方の辺である高さを 360 に固定する。当たり判定・ボムの
 * 大きさ・難易度に効く値がすべて端末非依存になり、ハイスコアの公平性を保てる。
 * 幅だけ 560〜900 の範囲で伸縮させ、その差は中央のフィールドの横幅で吸収する。
 */
export function computeFit(cssW: number, cssH: number): Fit {
  const logicalH = FIELD.LOGICAL_H
  const w = Math.max(1, cssW)
  const h = Math.max(1, cssH)
  const wanted = Math.round((logicalH * w) / h)
  const logicalW = clamp(wanted, FIELD.W_MIN, FIELD.W_MAX)
  const scale = Math.min(w / logicalW, h / logicalH, FIELD.MAX_SCALE)
  return {
    logicalW,
    logicalH,
    scale,
    offsetX: (w - logicalW * scale) / 2,
    offsetY: (h - logicalH * scale) / 2,
    portrait: h > w,
  }
}

/**
 * 判定と描画が共有する唯一の座標系。
 * 判定用と描画用の座標を二重に持たない、が事故を防ぐ一番のコツ。
 *
 * 箱は画面の左右の端に置く。親指の付け根の可動域にそのまま入るので、
 * 両手で持ったまま左右へ振り分けられる。
 */
export function computeLayout(
  logicalW: number,
  logicalH: number,
  insets: Insets = NO_INSETS
): Layout {
  const pad = FIELD.EDGE_PAD
  const left = pad + insets.left
  const right = logicalW - pad - insets.right

  const hud = {
    x: left,
    y: insets.top + 4,
    w: right - left,
    h: FIELD.HUD_H,
  }

  const top = hud.y + hud.h + 4
  const bottom = logicalH - pad - insets.bottom
  const zoneH = Math.max(80, bottom - top)
  const zoneW = Math.min(FIELD.ZONE_W, (right - left) * 0.3)

  /** 箱の内側。溜まったボムはこの中を歩き回る */
  const innerOf = (x: number) => ({
    x: x + 8,
    y: top + 10,
    w: zoneW - 16,
    h: zoneH - 20,
  })

  // 左が赤、右が黒で固定。毎回同じ場所にあることが習熟に効くので入れ替えない
  const zones = [
    {
      kind: 'red' as const,
      rect: { x: left, y: top, w: zoneW, h: zoneH },
      inner: innerOf(left),
    },
    {
      kind: 'black' as const,
      rect: { x: right - zoneW, y: top, w: zoneW, h: zoneH },
      inner: innerOf(right - zoneW),
    },
  ]

  const fieldX = left + zoneW + FIELD.ZONE_GAP
  const field = {
    x: fieldX,
    y: top,
    w: Math.max(80, right - zoneW - FIELD.ZONE_GAP - fieldX),
    h: zoneH,
  }

  return { logicalW, logicalH, hud, field, zones }
}
