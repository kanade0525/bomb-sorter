import { describe, expect, it } from 'vitest'
import type { BombKind } from '../core/types'
import { COLOR, styleOf, type KindStyle } from './palette'

const KINDS: BombKind[] = ['round', 'square']

describe('styleOf', () => {
  it('round と square で違うスタイルを返す', () => {
    expect(styleOf('round')).not.toEqual(styleOf('square'))
  })

  it('色以外の手掛かり（ラベル）も必ず違う', () => {
    // 色覚多様性への配慮。色だけで区別させない受け入れ基準を機械で見張る
    const a = styleOf('round')
    const b = styleOf('square')
    expect(a.label).not.toBe(b.label)
    expect(a.label.length).toBeGreaterThan(0)
    expect(b.label.length).toBeGreaterThan(0)
  })

  it('すべての項目が round と square で別の値になっている', () => {
    // どれか 1 つでも同じ値だと「その項目だけを見ている描画」が両者を描き分けられなくなる。
    // 項目名は固定せず実物から取る。スタイルを増やしたときも自動で検査対象になる
    const a = styleOf('round')
    const b = styleOf('square')
    const keys = Object.keys(a) as (keyof KindStyle)[]
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      expect(a[k], `${k} が round と square で同じ`).not.toBe(b[k])
    }
  })

  it('同じ種類なら常に同じオブジェクトを返す（毎フレーム生成しない）', () => {
    expect(styleOf('round')).toBe(styleOf('round'))
    expect(styleOf('square')).toBe(styleOf('square'))
  })

  it('すべての項目が空でない文字列で埋まっている', () => {
    for (const kind of KINDS) {
      const s = styleOf(kind)
      for (const [k, v] of Object.entries(s)) {
        expect(typeof v, `${kind}.${k}`).toBe('string')
        expect(v.length, `${kind}.${k}`).toBeGreaterThan(0)
      }
    }
  })

  it('色の指定が CSS として解釈できる形をしている', () => {
    const ok = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i
    for (const kind of KINDS) {
      const s = styleOf(kind)
      for (const [key, v] of Object.entries(s)) {
        // label だけは色ではなく読み上げ用の言葉
        if (key === 'label') continue
        expect(v, `${kind}.${key}`).toMatch(ok)
      }
    }
  })

  it('ラベルは「まる」「しかく」で、形を指す言葉になっている', () => {
    // 「あか」「くろ」のような色の言葉に変えないことを固定する
    expect(styleOf('round').label).toBe('まる')
    expect(styleOf('square').label).toBe('しかく')
  })
})

describe('COLOR', () => {
  it('すべて CSS の色として解釈できる', () => {
    const ok = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i
    for (const [k, v] of Object.entries(COLOR)) {
      expect(v, k).toMatch(ok)
    }
  })

  it('文字色と背景色が同じではない', () => {
    expect(COLOR.text).not.toBe(COLOR.bg)
    expect(COLOR.textDim).not.toBe(COLOR.bg)
    expect(COLOR.danger).not.toBe(COLOR.bg)
  })

  it('種類ごとの色と共通色が衝突していない', () => {
    // ゾーンの枠と危険色が同じだと「危ない」の表現がゾーンに埋もれる
    for (const kind of KINDS) {
      expect(styleOf(kind).zoneEdge).not.toBe(COLOR.danger)
    }
  })
})
