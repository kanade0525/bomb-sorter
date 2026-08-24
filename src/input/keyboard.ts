import type { Command } from '../core/types'

export interface KeyboardHandlers {
  onCommand(cmd: Command): void
  onToggleMute(): void
}

/**
 * キーボード操作。マウスしかない環境でも遊べるようにする。
 * ボタン自身は DOM の button なので Tab と Enter は何もしなくても効く。
 */
export function createKeyboardInput(h: KeyboardHandlers): () => void {
  const onKey = (e: KeyboardEvent) => {
    // ボタンにフォーカスがある状態の Enter/Space はボタン側に任せる
    const onButton = document.activeElement instanceof HTMLButtonElement
    switch (e.key) {
      case ' ':
      case 'Enter':
        if (onButton) return
        e.preventDefault()
        h.onCommand('start')
        break
      case 'Escape':
        e.preventDefault()
        h.onCommand('pause')
        break
      case 'r':
      case 'R':
        h.onCommand('restart')
        break
      case 'm':
      case 'M':
        h.onToggleMute()
        break
      default:
        break
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
