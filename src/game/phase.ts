import type { Command, Phase } from '../core/types'

/** 遷移のきっかけ。外からの Command と、内部で起きる出来事の両方を含む */
export type PhaseEvent = Command | 'ready-done' | 'die' | 'explode-done'

/**
 * フェーズ遷移表。ここだけを見れば全遷移が分かる状態を保つ。
 * 定義のない組み合わせは「何も起きない」= 現フェーズをそのまま返す。
 *
 * exploding を playing と分けているのは、爆発演出中に別のボムの導火線が尽きて
 * 二重に爆発する事故を構造的に防ぐため。
 */
export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  switch (phase) {
    case 'title':
      return event === 'start' ? 'ready' : phase
    case 'ready':
      if (event === 'ready-done') return 'playing'
      if (event === 'pause') return 'paused'
      return phase
    case 'playing':
      if (event === 'pause') return 'paused'
      if (event === 'die') return 'exploding'
      return phase
    case 'paused':
      // 復帰は必ず ready を経由させる。復帰した瞬間に爆死する理不尽を避ける
      if (event === 'resume') return 'ready'
      if (event === 'restart') return 'ready'
      if (event === 'title') return 'title'
      return phase
    case 'exploding':
      return event === 'explode-done' ? 'gameover' : phase
    case 'gameover':
      if (event === 'restart') return 'ready'
      if (event === 'title') return 'title'
      return phase
  }
}
