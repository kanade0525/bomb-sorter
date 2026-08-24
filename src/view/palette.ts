import type { BombKind } from '../core/types'

/**
 * 色は形の写像にすぎない、という関係を保つための一箱。
 * round と square は色だけでなく、形・刻印・導火線の位置でも区別できるようにしてある。
 * 白黒に印刷しても 100% 判別できることが受け入れ基準。
 */
export const COLOR = {
  bg: '#12141a',
  bgDeep: '#0d0f14',
  fieldEdge: '#1d2130',
  text: '#e8ecf4',
  textDim: '#98a1b5',
  accent: '#ffd166',
  /** 爆発・導火線切れ。「まる」の赤（#e4453a）と近いが、全画面の事象なので文脈で混ざらない */
  danger: '#ff5d52',
  /**
   * 「ここではない」を伝える否定色。
   * まるボムの正しい行き先の赤と同じ色で拒否を出すと意味が衝突するので、
   * UI の否定だけは赤族から外して別の色にしてある。
   */
  reject: '#ff2d78',
  /** 部品の輪郭。背景に対して約 3:1 を確保する（WCAG 1.4.11） */
  outline: '#575e70',
} as const

export interface KindStyle {
  body: string
  bodyLight: string
  edge: string
  mark: string
  zoneFill: string
  zoneEdge: string
  /** ゾーンに描く形アイコンの塗り。zoneFill の上で 3:1 以上になる明るさにする */
  zoneIcon: string
  label: string
}

const ROUND: KindStyle = {
  body: '#e4453a',
  bodyLight: '#ff7a6b',
  edge: '#7a1e18',
  mark: 'rgba(255,255,255,0.6)',
  zoneFill: 'rgba(228,69,58,0.14)',
  zoneEdge: '#e4453a',
  zoneIcon: '#e4453a',
  label: 'まる',
}

const SQUARE: KindStyle = {
  body: '#2b3040',
  bodyLight: '#48506a',
  // 暗い本体が背景に溶けないよう、縁は明るくする
  edge: '#8a93a6',
  mark: 'rgba(255,255,255,0.7)',
  zoneFill: 'rgba(138,147,166,0.14)',
  zoneEdge: '#8a93a6',
  // 本体色（#2b3040）をそのまま置くとゾーンの塗りに対して 1.15:1 しかなく、
  // 左だけが「無効なボタン」に見えてしまう。仕分け先は対等に見えないといけない
  zoneIcon: '#5c6580',
  label: 'しかく',
}

export function styleOf(kind: BombKind): KindStyle {
  return kind === 'round' ? ROUND : SQUARE
}
