import { describe, expect, it } from 'vitest'
import { nextPhase } from './phase'

describe('nextPhase', () => {
  it('タイトルから開始で ready へ入る', () => {
    expect(nextPhase('title', 'start')).toBe('ready')
  })

  it('ready はカウント終了で playing へ進む', () => {
    expect(nextPhase('ready', 'ready-done')).toBe('playing')
  })

  it('playing はポーズで paused、復帰は ready を経由する', () => {
    expect(nextPhase('playing', 'pause')).toBe('paused')
    expect(nextPhase('paused', 'resume')).toBe('ready')
  })

  it('playing で死ぬと exploding を経て gameover になる', () => {
    expect(nextPhase('playing', 'die')).toBe('exploding')
    expect(nextPhase('exploding', 'explode-done')).toBe('gameover')
  })

  it('gameover からリトライで ready へ戻る', () => {
    expect(nextPhase('gameover', 'restart')).toBe('ready')
  })

  it('爆発演出中は二重に死なない', () => {
    expect(nextPhase('exploding', 'die')).toBe('exploding')
  })

  it('定義のない遷移は無視される', () => {
    expect(nextPhase('title', 'pause')).toBe('title')
    expect(nextPhase('title', 'die')).toBe('title')
    expect(nextPhase('gameover', 'pause')).toBe('gameover')
    expect(nextPhase('playing', 'start')).toBe('playing')
    expect(nextPhase('paused', 'die')).toBe('paused')
  })
})
