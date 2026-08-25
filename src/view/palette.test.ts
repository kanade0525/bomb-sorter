import { describe, expect, it } from 'vitest'
import type { BombKind } from '../core/types'
import { COLOR, styleOf } from './palette'

/** #rrggbb から WCAG の相対輝度を出す */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`16 進の色ではない: ${hex}`)
  const v = Number.parseInt(m[1]!, 16)
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const KINDS: BombKind[] = ['red', 'black']

describe('styleOf', () => {
  it('2 種類で違う色を返す', () => {
    const a = styleOf('red')
    const b = styleOf('black')
    expect(a.body).not.toBe(b.body)
    expect(a.binEdge).not.toBe(b.binEdge)
  })

  it('同じ種類なら必ず同じものを返す', () => {
    for (const k of KINDS) {
      expect(styleOf(k)).toEqual(styleOf(k))
    }
  })

  /**
   * 形での区別をやめて色だけにしたので、ここが崩れると色覚に頼れない人が遊べなくなる。
   * 明度差が十分にあれば、色が見分けられなくてもグレースケールで判別できる。
   */
  it('2 種類の本体は明度でも判別できる（コントラスト比 3:1 以上）', () => {
    const c = contrast(styleOf('red').body, styleOf('black').body)
    expect(c).toBeGreaterThanOrEqual(3)
  })

  it('暗い方の輪郭は背景から浮く（コントラスト比 3:1 以上）', () => {
    expect(contrast(styleOf('black').edge, COLOR.bg)).toBeGreaterThanOrEqual(3)
  })

  it('明るい方の本体も背景から浮く', () => {
    expect(contrast(styleOf('red').body, COLOR.bg)).toBeGreaterThanOrEqual(3)
  })

  it('本文の文字は背景に対して 4.5:1 以上ある', () => {
    expect(contrast(COLOR.text, COLOR.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(COLOR.textDim, COLOR.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(COLOR.accent, COLOR.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(COLOR.danger, COLOR.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('部品の輪郭は背景に対して 2.5:1 以上ある', () => {
    expect(contrast(COLOR.outline, COLOR.bg)).toBeGreaterThanOrEqual(2.5)
  })

  it('明暗の 3 段（ハイライト・本体・影）が順に暗くなる', () => {
    for (const k of KINDS) {
      const st = styleOf(k)
      expect(luminance(st.light)).toBeGreaterThan(luminance(st.body))
      expect(luminance(st.body)).toBeGreaterThan(luminance(st.shade))
    }
  })
})
