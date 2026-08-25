import type { Layout, Rect } from '../core/types'
import type { Viewport } from './viewport'

/**
 * 工場の床。鉄板の継ぎ目とリベット、境界のトラロープ。
 *
 * 毎フレーム描くとリベットだけで数百回の塗りになるので、
 * 画面の大きさが変わったときだけ裏で 1 枚に描いておいて、あとは貼るだけにする。
 * ピクセルの見た目を保ちたいので、裏の 1 枚は実解像度（デバイスピクセル）で作る。
 */

const STEEL = {
  base: '#1a1d26',
  plate: '#1e222c',
  seam: '#12141b',
  edgeLight: '#2b3040',
  rivet: '#39405240',
  /** 鉄板 1 枚の大きさ（論理px） */
  PLATE: 56,
} as const

const HAZARD = {
  yellow: '#e8b427',
  dark: '#181a20',
  /** 縞の幅（論理px） */
  BAND: 12,
  /** 帯の厚み（論理px） */
  THICK: 12,
  /** ドット 1 個の大きさ。ボムのドットに揃える */
  DOT: 4,
} as const

export interface FloorCache {
  /** 現在のビューポートに合った床を返す。必要なら描き直す */
  get(vp: Viewport): HTMLCanvasElement | null
}

export function createFloorCache(): FloorCache {
  let canvas: HTMLCanvasElement | null = null
  let key = ''

  return {
    get(vp) {
      const w = Math.max(1, Math.round(vp.fit.logicalW * vp.fit.scale * vp.dpr))
      const h = Math.max(1, Math.round(vp.fit.logicalH * vp.fit.scale * vp.dpr))
      const next = `${w}x${h}|${vp.layout.field.x}|${vp.layout.field.w}|${vp.layout.field.y}|${vp.layout.field.h}`
      if (key === next && canvas) return canvas

      const el = canvas ?? document.createElement('canvas')
      el.width = w
      el.height = h
      const ctx = el.getContext('2d')
      if (!ctx) return null
      ctx.setTransform(vp.dpr * vp.fit.scale, 0, 0, vp.dpr * vp.fit.scale, 0, 0)
      paintFloor(ctx, vp.layout)
      canvas = el
      key = next
      return canvas
    },
  }
}

function paintFloor(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const { logicalW, logicalH, field } = layout

  ctx.fillStyle = STEEL.base
  ctx.fillRect(0, 0, logicalW, logicalH)

  // ---- 鉄板の継ぎ目 ----
  const p = STEEL.PLATE
  for (let y = 0; y < logicalH; y += p) {
    for (let x = 0; x < logicalW; x += p) {
      // 市松に少しだけ明るさを変えて、板が並んでいるように見せる
      const alt = ((x / p) | 0) % 2 === ((y / p) | 0) % 2
      ctx.fillStyle = alt ? STEEL.plate : STEEL.base
      ctx.fillRect(x, y, p, p)

      // 上と左に細いハイライト、下と右に継ぎ目の影
      ctx.fillStyle = STEEL.edgeLight
      ctx.fillRect(x, y, p, 1)
      ctx.fillRect(x, y, 1, p)
      ctx.fillStyle = STEEL.seam
      ctx.fillRect(x, y + p - 1, p, 1)
      ctx.fillRect(x + p - 1, y, 1, p)

      // リベット
      ctx.fillStyle = STEEL.rivet
      for (const [rx, ry] of [
        [5, 5],
        [p - 7, 5],
        [5, p - 7],
        [p - 7, p - 7],
      ] as const) {
        ctx.fillRect(x + rx, y + ry, 2, 2)
      }
    }
  }

  // ---- 境界のトラロープ ----
  // フィールドと箱の間、つまり「ここから先は仕分け場」という線を床に引く。
  // フィールドの外側に貼ると上端が HUD と重なるので、内側の縁に貼る。
  // 床に貼ったテープなので、ボムすけがその上を歩いても不自然ではない。
  const t = HAZARD.THICK
  hazardBand(ctx, { x: field.x, y: field.y, w: t, h: field.h }, 'v')
  hazardBand(ctx, { x: field.x + field.w - t, y: field.y, w: t, h: field.h }, 'v')
  hazardBand(ctx, { x: field.x, y: field.y, w: field.w, h: t }, 'h')
  hazardBand(ctx, { x: field.x, y: field.y + field.h - t, w: field.w, h: t }, 'h')
}

/**
 * 黄と黒の斜め縞。工事現場の「トラロープ」の見た目。
 *
 * 斜めの多角形で塗ると縁が滑らかになって、まわりのドットの目から浮く。
 * ドットを 1 個ずつ置いて、階段状の斜めにする。
 */
function hazardBand(ctx: CanvasRenderingContext2D, rect: Rect, axis: 'h' | 'v'): void {
  if (rect.w <= 0 || rect.h <= 0) return
  const d = HAZARD.DOT
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()

  ctx.fillStyle = HAZARD.dark
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)

  ctx.fillStyle = HAZARD.yellow
  const period = HAZARD.BAND * 2
  const cols = Math.ceil(rect.w / d)
  const rows = Math.ceil(rect.h / d)
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      // x + y を周期で折り返すと 45 度の縞になる
      const v = (((rx * d + ry * d) % period) + period) % period
      if (v < HAZARD.BAND) {
        ctx.fillRect(rect.x + rx * d, rect.y + ry * d, d, d)
      }
    }
  }

  // 帯の縁に暗いドットを置いて、床に貼ったテープらしくする
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(rect.x, rect.y, rect.w, d / 2)
  ctx.fillRect(rect.x, rect.y + rect.h - d / 2, rect.w, d / 2)
  ctx.fillRect(rect.x, rect.y, d / 2, rect.h)
  ctx.fillRect(rect.x + rect.w - d / 2, rect.y, d / 2, rect.h)
  ctx.restore()
  void axis
}
