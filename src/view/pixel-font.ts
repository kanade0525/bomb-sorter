/**
 * 数字用のビットマップフォント。5x7 ドット。
 *
 * ウェブフォントを読み込めない（CSP で外部通信を遮断していて、
 * フォントファイルも同梱しない方針）ので、字形をコードで持つ。
 * システムフォントを縮小拡大してピクセル風にする手もあるが、
 * それだと字の輪郭が中途半端に潰れる。得点や連鎖数のような
 * 一番目に入る数字は、最初からドットで組んだ方がきれいに出る。
 *
 * 日本語のラベルはシステムフォントのまま。漢字を 5x7 で組むのは無理があり、
 * 無理に潰すと読めなくなる。数字はドット、言葉はシステムフォント、
 * という組み合わせはピクセルアートのゲームでは一般的な作り。
 */

const W = 5
const H = 7

/** 1 が塗るドット。左上から右下へ 5 列 7 行 */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  x: ['00000', '10001', '01010', '00100', '01010', '10001', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

/** 文字間のドット数 */
const TRACKING = 1

export type PixelAlign = 'left' | 'center' | 'right'

/** ドット 1 個の大きさを p としたときの、文字列の幅（論理px） */
export function measurePixelText(text: string, p: number): number {
  if (text.length === 0) return 0
  return (text.length * (W + TRACKING) - TRACKING) * p
}

export function pixelTextHeight(p: number): number {
  return H * p
}

/**
 * 数字を描く。x, y は指定した揃え方における左上の基準点。
 * 未知の文字は空白として扱い、描画を落とさない。
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: number,
  color: string,
  align: PixelAlign = 'left'
): void {
  const total = measurePixelText(text, p)
  const startX = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total
  ctx.fillStyle = color
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i] ?? ' '] ?? GLYPHS[' ']!
    const gx = startX + i * (W + TRACKING) * p
    for (let row = 0; row < H; row++) {
      const line = glyph[row] ?? ''
      for (let col = 0; col < W; col++) {
        if (line[col] !== '1') continue
        ctx.fillRect(gx + col * p, y + row * p, p, p)
      }
    }
  }
}

/**
 * 影付きで描く。背景がボムでも床でも読めるようにする。
 * 影はドット単位でずらす（半端な位置に置くとピクセルの目が崩れる）。
 */
export function drawPixelTextShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: number,
  color: string,
  align: PixelAlign = 'left',
  shadow = 'rgba(13,15,20,0.85)'
): void {
  drawPixelText(ctx, text, x + p, y + p, p, shadow, align)
  drawPixelText(ctx, text, x, y, p, color, align)
}
