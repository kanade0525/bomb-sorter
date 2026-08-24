import { describe, expect, it } from 'vitest'
import { DEFAULT_SAVE, mergeBest, parseSave, serializeSave } from './highscore'

describe('parseSave', () => {
  it('正常な JSON を読める', () => {
    const s = serializeSave({ best: 1200, bestCombo: 7, muted: true, plays: 3 })
    expect(parseSave(s)).toEqual({ best: 1200, bestCombo: 7, muted: true, plays: 3 })
  })

  it('null や空文字なら初期値を返す', () => {
    expect(parseSave(null)).toEqual(DEFAULT_SAVE)
    expect(parseSave('')).toEqual(DEFAULT_SAVE)
    expect(parseSave(undefined)).toEqual(DEFAULT_SAVE)
  })

  it('壊れた値でもクラッシュしない', () => {
    for (const raw of ['abc', '{', '[]', 'null', 'true', '123', '"x"', '{"best":"abc"}']) {
      expect(() => parseSave(raw)).not.toThrow()
      expect(parseSave(raw).best).toBe(0)
    }
  })

  it('負の値や NaN、巨大数を正規化する', () => {
    expect(parseSave('{"best":-5}').best).toBe(0)
    expect(parseSave('{"best":1e400}').best).toBe(0)
    expect(parseSave('{"best":1.9}').best).toBe(1)
    expect(parseSave(`{"best":${Number.MAX_SAFE_INTEGER * 4}}`).best).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('muted は true 以外をすべて false にする', () => {
    expect(parseSave('{"muted":true}').muted).toBe(true)
    expect(parseSave('{"muted":"yes"}').muted).toBe(false)
    expect(parseSave('{"muted":1}').muted).toBe(false)
  })

  it('往復して値が変わらない', () => {
    const d = { best: 999, bestCombo: 12, muted: false, plays: 40 }
    expect(parseSave(serializeSave(d))).toEqual(d)
  })
})

describe('mergeBest', () => {
  it('記録を更新する', () => {
    const m = mergeBest({ best: 100, bestCombo: 2, muted: false, plays: 1 }, 500, 9)
    expect(m.best).toBe(500)
    expect(m.bestCombo).toBe(9)
    expect(m.plays).toBe(2)
  })

  it('低いスコアでは下がらない', () => {
    const m = mergeBest({ best: 900, bestCombo: 20, muted: true, plays: 5 }, 100, 3)
    expect(m.best).toBe(900)
    expect(m.bestCombo).toBe(20)
    expect(m.muted).toBe(true)
    expect(m.plays).toBe(6)
  })
})
