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
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * 画面サイズから論理解像度と拡大率を決める。
 *
 * 幅は 360 固定。当たり判定・ボムの大きさ・難易度に効く値をすべて端末非依存にして、
 * ハイスコアの公平性を保つ。高さだけ 560〜760 の範囲で伸縮させ、
 * その差はプレイフィールドの縦余白として吸収する。範囲外はレターボックスで逃がす。
 */
export function computeFit(cssW: number, cssH: number): Fit {
  const logicalW = FIELD.LOGICAL_W
  const w = Math.max(1, cssW)
  const h = Math.max(1, cssH)
  const wanted = Math.round((logicalW * h) / w)
  const logicalH = clamp(wanted, FIELD.H_MIN, FIELD.H_MAX)
  // 大画面で無制限に拡大すると、ボムもドラッグ距離も 2 倍近くになって
  // スマホ向けの操作感から離れる。上限を置いて中央に寄せる
  const scale = Math.min(w / logicalW, h / logicalH, FIELD.MAX_SCALE)
  return {
    logicalW,
    logicalH,
    scale,
    offsetX: (w - logicalW * scale) / 2,
    offsetY: (h - logicalH * scale) / 2,
  }
}

/**
 * 判定と描画が共有する唯一の座標系。
 * 判定用と描画用の座標を二重に持たない、が事故を防ぐ一番のコツ。
 */
export function computeLayout(
  logicalW: number,
  logicalH: number,
  insets: Insets = NO_INSETS
): Layout {
  const pad = FIELD.EDGE_PAD
  const hud = {
    x: pad + insets.left,
    y: insets.top + 6,
    w: logicalW - pad * 2 - insets.left - insets.right,
    h: FIELD.HUD_H,
  }

  // ゾーンの下端。ホームインジケータのスワイプ領域を必ず空ける
  const zoneBottom = logicalH - FIELD.ZONE_BOTTOM_PAD - insets.bottom
  const zoneY = zoneBottom - FIELD.ZONE_H
  const zoneW = (logicalW - pad * 2 - insets.left - insets.right - FIELD.ZONE_GAP) / 2
  const leftX = pad + insets.left

  // 左が square、右が round。毎回同じ場所にあることが習熟に効くので入れ替えない
  const zones = [
    {
      kind: 'square' as const,
      rect: { x: leftX, y: zoneY, w: zoneW, h: FIELD.ZONE_H },
      iconCenter: { x: leftX + zoneW / 2, y: zoneY + FIELD.ZONE_H * 0.42 },
    },
    {
      kind: 'round' as const,
      rect: { x: leftX + zoneW + FIELD.ZONE_GAP, y: zoneY, w: zoneW, h: FIELD.ZONE_H },
      iconCenter: {
        x: leftX + zoneW + FIELD.ZONE_GAP + zoneW / 2,
        y: zoneY + FIELD.ZONE_H * 0.42,
      },
    },
  ]

  const fieldY = hud.y + hud.h + 4
  const field = {
    x: pad + insets.left,
    y: fieldY,
    w: logicalW - pad * 2 - insets.left - insets.right,
    h: Math.max(80, zoneY - 10 - fieldY),
  }

  return { logicalW, logicalH, hud, field, zones }
}
