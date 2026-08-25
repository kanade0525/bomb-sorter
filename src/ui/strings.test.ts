import { describe, expect, it } from 'vitest'
import { pickStrings, setLanguage, t } from './strings'

describe('言語の選び方', () => {
  it('日本語のタグなら日本語になる', () => {
    for (const tag of ['ja', 'ja-JP', 'JA-jp', 'ja-Hira-JP']) {
      expect(pickStrings(tag).start, tag).toBe('ゲーム開始')
    }
  })

  it('日本語以外はすべて英語になる', () => {
    for (const tag of ['en', 'en-US', 'fr', 'ko-KR', 'zh-TW', 'pt-BR', '']) {
      expect(pickStrings(tag).start, tag).toBe('Start')
    }
  })

  it('java のように ja で始まる別の語に引っかからない', () => {
    // 単語境界を見ているので、'jav' は日本語扱いにしない
    expect(pickStrings('jav').start).toBe('Start')
  })

  it('setLanguage で切り替わり、t() が追従する', () => {
    setLanguage('en-US')
    expect(t().start).toBe('Start')
    setLanguage('ja-JP')
    expect(t().start).toBe('ゲーム開始')
  })
})

describe('文言表', () => {
  const ja = pickStrings('ja')
  const en = pickStrings('en')

  it('両方の言語で同じ項目が揃っている', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort())
  })

  it('空の文字列を持っていない（remainingPrefix を除く）', () => {
    for (const [lang, s] of [
      ['ja', ja],
      ['en', en],
    ] as const) {
      for (const [key, value] of Object.entries(s)) {
        if (key === 'remainingPrefix') continue
        if (typeof value === 'string') {
          expect(value.length, `${lang}.${key}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('遊び方の説明は 3 行ある', () => {
    expect(ja.rules).toHaveLength(3)
    expect(en.rules).toHaveLength(3)
  })

  it('組み立てる文言が、渡した数字を含んでいる', () => {
    for (const s of [ja, en]) {
      expect(s.srGameOver(1200, 3400)).toContain('1200')
      expect(s.srGameOver(1200, 3400)).toContain('3400')
      expect(s.srScore(50, 4)).toContain('50')
      expect(s.srScore(50, 4)).toContain('4')
      expect(s.bestLine(99, 7)).toContain('99')
      expect(s.statsNew(12, 5)).toContain('12')
      expect(s.stats(12, 5, 800)).toContain('800')
    }
  })

  it('連鎖が 1 のときは連鎖数を読み上げない', () => {
    for (const s of [ja, en]) {
      expect(s.srScore(10, 1)).not.toMatch(/1\s*(連鎖|chain)/)
    }
  })

  it('英語に日本語の文字が混ざっていない', () => {
    for (const [key, value] of Object.entries(en)) {
      if (typeof value !== 'string') continue
      expect(value, `en.${key}`).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    }
    for (const line of en.rules) {
      expect(line).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    }
    expect(en.srGameOver(1, 2)).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    expect(en.stats(1, 2, 3)).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
  })
})
