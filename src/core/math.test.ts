import { describe, expect, it } from 'vitest'
import { clamp, dist2, inCircle, lerp } from './math'

describe('clamp', () => {
  it('範囲内はそのまま返す', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  it('範囲外は端に寄せる', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('min > max の逆転した範囲では判定の先着順になる（範囲外の値を返しうる）', () => {
    // 逆転した範囲を渡すと「min も max も満たさない値」が返る。
    // つまり範囲を計算で作る箇所（dragBounds など）が逆転すると静かに壊れるので、
    // 挙動を仕様として固定して気付けるようにしておく
    expect(clamp(5, 10, 0)).toBe(10) // v < min が先に当たる
    expect(clamp(50, 10, 0)).toBe(0) // v > max が当たり、min を下回る値が返る
    expect(clamp(-5, 10, 0)).toBe(10)
  })

  it('NaN は比較が全て偽になるのでそのまま抜けてくる', () => {
    // NaN を 0 に丸めたりはしない。汚染源を隠さず、上流で NaN を作らないことを守る
    expect(Number.isNaN(clamp(NaN, 0, 10))).toBe(true)
  })

  it('境界に NaN が混ざると値がそのまま抜けてくる', () => {
    expect(clamp(5, NaN, 10)).toBe(5)
    expect(clamp(5, 0, NaN)).toBe(5)
  })

  it('Infinity を渡しても端に寄る', () => {
    expect(clamp(Infinity, 0, 10)).toBe(10)
    expect(clamp(-Infinity, 0, 10)).toBe(0)
    expect(clamp(5, -Infinity, Infinity)).toBe(5)
  })

  it('-0 はそのまま抜けるが値としては 0 と等しい', () => {
    // 比較が両方偽なので -0 が返る。以降の演算で 0 と同じに扱えるので害はない
    expect(clamp(-0, 0, 10)).toBe(-0)
    expect(clamp(-0, 0, 10) === 0).toBe(true)
  })
})

describe('lerp', () => {
  it('両端と中間', () => {
    expect(lerp(0, 10, 0)).toBe(0)
    expect(lerp(0, 10, 1)).toBe(10)
    expect(lerp(0, 10, 0.5)).toBe(5)
  })

  it('t が範囲外なら外挿する（clamp はしない）', () => {
    expect(lerp(0, 10, -1)).toBe(-10)
    expect(lerp(0, 10, 2)).toBe(20)
  })

  it('a と b が同じなら t に関係なく同じ値', () => {
    expect(lerp(7, 7, 0.3)).toBe(7)
  })
})

describe('dist2', () => {
  it('同じ点なら 0', () => {
    expect(dist2(3, 4, 3, 4)).toBe(0)
  })

  it('平方根を取らない 2 乗距離を返す', () => {
    expect(dist2(0, 0, 3, 4)).toBe(25)
  })

  it('引数の順を入れ替えても同じ', () => {
    expect(dist2(1, 2, -5, 9)).toBe(dist2(-5, 9, 1, 2))
  })
})

describe('inCircle', () => {
  it('中心は内側', () => {
    expect(inCircle(0, 0, 0, 0, 5)).toBe(true)
  })

  it('円周ちょうどは内側に含む（<= の取り決め）', () => {
    expect(inCircle(5, 0, 0, 0, 5)).toBe(true)
    expect(inCircle(0, -5, 0, 0, 5)).toBe(true)
    // 3-4-5 の直角三角形でちょうど半径に乗る点
    expect(inCircle(3, 4, 0, 0, 5)).toBe(true)
  })

  it('円周の外はわずかでも外側', () => {
    expect(inCircle(5.0001, 0, 0, 0, 5)).toBe(false)
    expect(inCircle(3, 4.0001, 0, 0, 5)).toBe(false)
  })

  it('半径 0 なら中心だけが内側', () => {
    expect(inCircle(0, 0, 0, 0, 0)).toBe(true)
    expect(inCircle(0.0001, 0, 0, 0, 0)).toBe(false)
  })

  it('半径が負なら 2 乗で正になるため中心付近が内側になる（負を渡さない前提の記録）', () => {
    // r*r で比較しているので負の半径は絶対値と同じ扱いになる。仕様として固定しておく
    expect(inCircle(0, 0, 0, 0, -5)).toBe(true)
    expect(inCircle(4.9, 0, 0, 0, -5)).toBe(true)
  })
})
