import { RENDER } from '../core/constants'
import type { Layout } from '../core/types'
import { computeFit, computeLayout, type Fit, type Insets } from './layout'

export interface Viewport {
  fit: Fit
  layout: Layout
  dpr: number
  insets: Insets
  /** canvas の CSS 上の位置。ポインタ座標の逆変換に使う */
  rect: { left: number; top: number }
}

/**
 * safe-area-inset を JS から読むためのプローブ。
 * env() は CSS からしか読めないので、padding に入れた要素の計算値を借りる。
 */
export function createSafeAreaProbe(): HTMLElement {
  const el = document.createElement('div')
  el.id = 'safe-probe'
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

export function readInsets(probe: HTMLElement): Insets {
  const s = getComputedStyle(probe)
  const num = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return {
    top: num(s.paddingTop),
    right: num(s.paddingRight),
    bottom: num(s.paddingBottom),
    left: num(s.paddingLeft),
  }
}

/**
 * canvas の実解像度と論理座標系を決める。
 * devicePixelRatio は 2 で打ち止めにする（3x 端末での塗り面積は 2.25 倍になり、
 * 見た目の差はほぼ無いのに描画コストだけが跳ねる）。
 */
export function measureViewport(canvas: HTMLCanvasElement, probe: HTMLElement): Viewport {
  const cssW = canvas.clientWidth || window.innerWidth
  const cssH = canvas.clientHeight || window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, RENDER.MAX_DPR)
  const fit = computeFit(cssW, cssH)

  const w = Math.round(cssW * dpr)
  const h = Math.round(cssH * dpr)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h

  // CSS px の inset を論理単位へ変換してからレイアウトに渡す
  const cssInsets = readInsets(probe)
  const insets: Insets = {
    top: cssInsets.top / fit.scale,
    right: cssInsets.right / fit.scale,
    bottom: cssInsets.bottom / fit.scale,
    left: cssInsets.left / fit.scale,
  }

  const box = canvas.getBoundingClientRect()
  return {
    fit,
    layout: computeLayout(fit.logicalW, fit.logicalH, insets),
    dpr,
    insets,
    rect: { left: box.left, top: box.top },
  }
}

/** 論理座標で描けるようにする。setTransform を直接組み、save/restore を節約する */
export function applyTransform(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  const s = vp.dpr * vp.fit.scale
  ctx.setTransform(s, 0, 0, s, vp.dpr * vp.fit.offsetX, vp.dpr * vp.fit.offsetY)
}

/**
 * ポインタの CSS 座標を論理座標へ。
 * e.offsetX は Safari の合成イベントで不安定なので使わず、必ず矩形基準で計算する。
 */
export function toLogical(
  vp: Viewport,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  return {
    x: (clientX - vp.rect.left - vp.fit.offsetX) / vp.fit.scale,
    y: (clientY - vp.rect.top - vp.fit.offsetY) / vp.fit.scale,
  }
}
