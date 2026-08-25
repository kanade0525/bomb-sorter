import { FIELD } from '../core/constants'
import { clamp } from '../core/math'
import type { Layout, Rect } from '../core/types'

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
  /** 縦持ちかどうか。箱を下に並べるか左右に置くかが変わる */
  portrait: boolean
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * 画面サイズから論理解像度と拡大率を決める。
 *
 * 縦持ちでも横持ちでも遊べる。どちらでも短い方の辺を 360 に固定するので、
 * 当たり判定・ボムの大きさ・難易度に効く値は端末と向きによらず同じになる。
 * 長い方の辺だけ比率に応じて伸縮し、その差はフィールドの広さで吸収する。
 */
export function computeFit(cssW: number, cssH: number): Fit {
  const w = Math.max(1, cssW)
  const h = Math.max(1, cssH)
  const portrait = h > w
  const short = FIELD.LOGICAL_SHORT

  let logicalW: number
  let logicalH: number
  if (portrait) {
    logicalW = short
    logicalH = clamp(Math.round((short * h) / w), FIELD.PORT_LONG_MIN, FIELD.PORT_LONG_MAX)
  } else {
    logicalH = short
    logicalW = clamp(Math.round((short * w) / h), FIELD.LAND_LONG_MIN, FIELD.LAND_LONG_MAX)
  }

  const scale = Math.min(w / logicalW, h / logicalH, FIELD.MAX_SCALE)
  return {
    logicalW,
    logicalH,
    scale,
    offsetX: (w - logicalW * scale) / 2,
    offsetY: (h - logicalH * scale) / 2,
    portrait,
  }
}

/**
 * 判定と描画が共有する唯一の座標系。
 * 判定用と描画用の座標を二重に持たない、が事故を防ぐ一番のコツ。
 *
 * 向きは縦横比から決める。fit と同じ判定にしておかないと、
 * 「fit は横だと思っているのに layout は縦を返す」というずれが起きる。
 */
export function computeLayout(
  logicalW: number,
  logicalH: number,
  insets: Insets = NO_INSETS
): Layout {
  return logicalH > logicalW
    ? portraitLayout(logicalW, logicalH, insets)
    : landscapeLayout(logicalW, logicalH, insets)
}

/** 箱の内側。溜まったボムはこの中を歩き回る */
function innerOf(rect: Rect): Rect {
  return {
    x: rect.x + 8,
    y: rect.y + 10,
    w: Math.max(8, rect.w - 16),
    h: Math.max(8, rect.h - 20),
  }
}

/**
 * 横持ち。箱は画面の左右の端に置く。
 * 両手で持ったまま、親指の付け根の可動域で左右へ振り分けられる。
 */
function landscapeLayout(logicalW: number, logicalH: number, insets: Insets): Layout {
  const pad = FIELD.EDGE_PAD
  const left = pad + insets.left
  const right = logicalW - pad - insets.right

  const hud = {
    x: left,
    y: insets.top + 4,
    w: right - left,
    h: FIELD.HUD_H_LANDSCAPE,
  }

  const top = hud.y + hud.h + 4
  const bottom = logicalH - pad - insets.bottom
  const zoneH = Math.max(80, bottom - top)
  const zoneW = Math.min(FIELD.ZONE_W, (right - left) * 0.3)

  // 左が赤、右が黒で固定。毎回同じ場所にあることが習熟に効くので入れ替えない
  const leftRect = { x: left, y: top, w: zoneW, h: zoneH }
  const rightRect = { x: right - zoneW, y: top, w: zoneW, h: zoneH }
  const zones = [
    { kind: 'red' as const, rect: leftRect, inner: innerOf(leftRect) },
    { kind: 'black' as const, rect: rightRect, inner: innerOf(rightRect) },
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

/**
 * 縦持ち。箱は画面の下に 2 つ並べる。
 * 片手でも、親指の可動域の内側に両方の箱が入る。
 */
function portraitLayout(logicalW: number, logicalH: number, insets: Insets): Layout {
  const pad = FIELD.EDGE_PAD
  const left = pad + insets.left
  const right = logicalW - pad - insets.right

  const hud = {
    x: left,
    y: insets.top + 4,
    w: right - left,
    h: FIELD.HUD_H_PORTRAIT,
  }

  // 箱の下端。ホームインジケータのスワイプ領域を必ず空ける
  const bottom = logicalH - pad - insets.bottom
  const zoneH = Math.min(FIELD.ZONE_H_PORTRAIT, (bottom - hud.y - hud.h) * 0.42)
  const zoneY = bottom - zoneH
  const zoneW = (right - left - FIELD.ZONE_GAP) / 2

  // 左が赤、右が黒。横持ちと同じ並びにして、向きを変えても迷わないようにする
  const leftRect = { x: left, y: zoneY, w: zoneW, h: zoneH }
  const rightRect = { x: left + zoneW + FIELD.ZONE_GAP, y: zoneY, w: zoneW, h: zoneH }
  const zones = [
    { kind: 'red' as const, rect: leftRect, inner: innerOf(leftRect) },
    { kind: 'black' as const, rect: rightRect, inner: innerOf(rightRect) },
  ]

  const fieldY = hud.y + hud.h + 4
  const field = {
    x: left,
    y: fieldY,
    w: right - left,
    h: Math.max(80, zoneY - FIELD.ZONE_GAP - fieldY),
  }

  return { logicalW, logicalH, hud, field, zones }
}
