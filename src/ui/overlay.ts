import type { Command, World } from '../core/types'
import { createIcon, type IconName } from './icons'

/**
 * タイトル・ポーズ・ゲームオーバーの画面。
 *
 * Canvas に描かず DOM の実 button にしてあるのは、キーボード操作・フォーカスリング・
 * 読み上げが何もしなくても付いてくるから。innerHTML は使わず要素を組み立てる。
 */
export interface Overlay {
  update(world: World, best: number, bestCombo: number): void
  onCommand(cb: (cmd: Command) => void): void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className: string, icon: IconName): HTMLButtonElement {
  const b = el('button', className)
  b.type = 'button'
  b.appendChild(createIcon(icon, 22))
  b.appendChild(el('span', undefined, label))
  return b
}

const DEATH_TEXT: Record<string, string> = {
  wrong: 'ちがう ばしょへ いれた',
  fuse: 'どうかせんが つきた',
}

export function createOverlay(root: HTMLElement): Overlay {
  const listeners: ((cmd: Command) => void)[] = []
  const emit = (cmd: Command) => {
    for (const f of listeners) f(cmd)
  }

  // ---- タイトル ----
  const title = el('section', 'screen screen-title')
  title.appendChild(el('p', 'eyebrow', 'いろと かたちで わける'))
  title.appendChild(el('h2', 'title-logo', 'Bomb Sorter'))
  const rules = el('ul', 'rules')
  for (const t of [
    'ボムを ドラッグして おなじ かたちの ばしょへ',
    'まちがえると ばくはつ。どうかせんが つきても ばくはつ',
    'つづけて せいかいすると れんさで とくてん アップ',
  ]) {
    rules.appendChild(el('li', undefined, t))
  }
  title.appendChild(rules)
  const titleBest = el('p', 'best', '')
  title.appendChild(titleBest)
  const startBtn = button('はじめる', 'primary', 'play_arrow')
  startBtn.addEventListener('click', () => emit('start'))
  title.appendChild(startBtn)
  const hint = el('p', 'hint', '音が でないときは 本体の マナーモードを かくにんしてください')
  title.appendChild(hint)

  // ---- ポーズ ----
  const paused = el('section', 'screen screen-paused')
  paused.appendChild(el('h2', undefined, 'いちじ ていし'))
  const resumeBtn = button('つづける', 'primary', 'play_arrow')
  resumeBtn.addEventListener('click', () => emit('resume'))
  paused.appendChild(resumeBtn)
  const quitBtn = button('タイトルへ もどる', 'ghost', 'home')
  quitBtn.addEventListener('click', () => emit('title'))
  paused.appendChild(quitBtn)

  // ---- ゲームオーバー ----
  const over = el('section', 'screen screen-over')
  over.appendChild(el('h2', undefined, 'ゲームオーバー'))
  const reason = el('p', 'reason', '')
  over.appendChild(reason)
  const scoreBig = el('p', 'score-big', '0')
  over.appendChild(scoreBig)
  const stats = el('p', 'stats', '')
  over.appendChild(stats)
  const retryBtn = button('もう一度', 'primary', 'refresh')
  retryBtn.addEventListener('click', () => emit('restart'))
  over.appendChild(retryBtn)
  const backBtn = button('タイトルへ', 'ghost', 'home')
  backBtn.addEventListener('click', () => emit('title'))
  over.appendChild(backBtn)

  // 画面が開いたときのフォーカス先。ボタンに当てると起動直後から
  // 派手なフォーカスリングが出てタッチ利用者には不自然なので、
  // 節そのものを受け皿にして、リングはキーボードで辿ったときだけ出す
  for (const s of [title, paused, over]) {
    s.tabIndex = -1
    s.setAttribute('role', 'group')
  }

  root.appendChild(title)
  root.appendChild(paused)
  root.appendChild(over)

  let shown = ''

  return {
    update(world, best, bestCombo) {
      const phase = world.phase
      const key = `${phase}|${world.score}|${best}|${world.bestCombo}|${world.deathReason ?? ''}`
      if (key === shown) return
      shown = key

      const visible = phase === 'title' || phase === 'paused' || phase === 'gameover'
      root.classList.toggle('is-open', visible)
      // プレイ中はオーバーレイを完全に無効化して、指がボムに届くようにする
      root.setAttribute('aria-hidden', visible ? 'false' : 'true')

      title.hidden = phase !== 'title'
      paused.hidden = phase !== 'paused'
      over.hidden = phase !== 'gameover'

      titleBest.textContent = best > 0 ? `ハイスコア ${best}（さいこう ${bestCombo} れんさ）` : ''

      if (phase === 'gameover') {
        reason.textContent = DEATH_TEXT[world.deathReason ?? ''] ?? ''
        scoreBig.textContent = String(world.score)
        const isNew = world.score > 0 && world.score >= best
        stats.textContent = isNew
          ? `しんきろく！ ${world.sorted}こ しわけ / さいこう ${world.bestCombo} れんさ`
          : `${world.sorted}こ しわけ / さいこう ${world.bestCombo} れんさ / ハイスコア ${best}`
      }

      // 開いた画面へフォーカスを移す。読み上げが今どの画面かを伝えられるようにする
      if (visible) {
        const section = phase === 'title' ? title : phase === 'paused' ? paused : over
        if (!section.contains(document.activeElement)) {
          section.focus({ preventScroll: true })
        }
      }
    },

    onCommand(cb) {
      listeners.push(cb)
    },
  }
}
