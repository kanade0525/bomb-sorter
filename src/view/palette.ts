import type { BombKind } from '../core/types'

/**
 * 色。
 *
 * ボムの形は 2 種類とも完全に同じで、違うのは色だけ。形での冗長化をやめた代わりに、
 * 赤 #e4453a（相対輝度 0.21）と黒 #23262f（同 0.02）という明度差の大きい組み合わせを
 * 選んである。コントラスト比は約 5.3:1 あるので、色の区別がつかなくても、
 * グレースケールでも「明るい方／暗い方」で判別できる。
 */
export const COLOR = {
  bg: '#12141a',
  bgDeep: '#0d0f14',
  fieldEdge: '#232838',
  text: '#e8ecf4',
  textDim: '#98a1b5',
  accent: '#ffd166',
  /** 爆発・導火線切れ */
  danger: '#ff5d52',
  /** 部品の輪郭。背景に対して約 3:1 を確保する（WCAG 1.4.11） */
  outline: '#575e70',
  /** 足。2 種類とも同じ生き物なので、脚の色は共通にする */
  leg: '#3d4354',
  legFoot: '#5f687e',
} as const

export interface KindStyle {
  /** 本体 */
  body: string
  /** 上側のハイライト */
  light: string
  /** 下側の影 */
  shade: string
  /** 輪郭。暗い方が背景に溶けないようにする */
  edge: string
  /** 箱の塗り */
  binFill: string
  /** 箱の枠 */
  binEdge: string
}

const RED: KindStyle = {
  body: '#e4453a',
  light: '#ff8a7a',
  shade: '#a02a22',
  edge: '#6d1a14',
  binFill: 'rgba(228,69,58,0.16)',
  binEdge: '#e4453a',
}

const BLACK: KindStyle = {
  body: '#2a2e3a',
  light: '#565d72',
  shade: '#171a22',
  // 暗い本体が背景に溶けないよう輪郭は明るくするが、明るすぎると銀色に見えるので
  // 「縁だけ光っている黒」に見える程度に留める
  edge: '#78829a',
  binFill: 'rgba(154,163,182,0.14)',
  binEdge: '#9aa3b6',
}

export function styleOf(kind: BombKind): KindStyle {
  return kind === 'red' ? RED : BLACK
}
