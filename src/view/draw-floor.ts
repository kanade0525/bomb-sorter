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
  BAND: 11,
  /** 帯の厚み（論理px） */
  THICK: 9,
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
  // フィールドと箱の間、つまり「ここから先は仕分け場」という線を床に引く
  const t = HAZARD.THICK
  hazardBand(ctx, { x: field.x - t, y: field.y, w: t, h: field.h }, 'v')
  hazardBand(ctx, { x: field.x + field.w, y: field.y, w: t, h: field.h }, 'v')
  hazardBand(ctx, { x: field.x - t, y: field.y - t, w: field.w + t * 2, h: t }, 'h')
  hazardBand(ctx, { x: field.x - t, y: field.y + field.h, w: field.w + t * 2, h: t }, 'h')
}

/** 黄と黒の斜め縞。工事現場の「トラロープ」の見た目 */
function hazardBand(ctx: CanvasRenderingContext2D, rect: Rect, axis: 'h' | 'v'): void {
  if (rect.w <= 0 || rect.h <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()

  ctx.fillStyle = HAZARD.dark
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)

  ctx.fillStyle = HAZARD.yellow
  const band = HAZARD.BAND
  const span = rect.w + rect.h
  // 45 度の平行四辺形を並べる。縦帯と横帯で縞の向きを揃える
  for (let i = -rect.h; i < span; i += band * 2) {
    ctx.beginPath()
    if (axis === 'v') {
      ctx.moveTo(rect.x + i, rect.y)
      ctx.lineTo(rect.x + i + band, rect.y)
      ctx.lineTo(rect.x + i + band - rect.h, rect.y + rect.h)
      ctx.lineTo(rect.x + i - rect.h, rect.y + rect.h)
    } else {
      ctx.moveTo(rect.x + i, rect.y)
      ctx.lineTo(rect.x + i + band, rect.y)
      ctx.lineTo(rect.x + i + band - rect.h, rect.y + rect.h)
      ctx.lineTo(rect.x + i - rect.h, rect.y + rect.h)
    }
    ctx.closePath()
    ctx.fill()
  }

  // 帯の縁に暗い線を入れて、床に貼ったテープらしくする
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 1
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1)
  ctx.restore()
}
