import type { Command, World } from '../core/types'
import { createIcon, type IconName } from './icons'

/**
 * タイトル・ポーズ・ゲームオーバー・縦持ちの案内。
 *
 * Canvas に描かず DOM の実 button にしてあるのは、キーボード操作・フォーカスリング・
 * 読み上げが何もしなくても付いてくるから。innerHTML は使わず要素を組み立てる。
 */
export interface Overlay {
  update(world: World, best: number, bestCombo: number, portrait: boolean): void
  onCommand(cb: (cmd: Command) => void): void
  /** 何かしらの画面を出しているか。上部ボタンの扱いを決めるのに使う */
  isOpen(): boolean
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
  wrong: '違う色の箱に入れた',
  fuse: '導火線が尽きた',
}

export function createOverlay(root: HTMLElement): Overlay {
  const listeners: ((cmd: Command) => void)[] = []
  const emit = (cmd: Command) => {
    for (const f of listeners) f(cmd)
  }

  // ---- タイトル ----
  const title = el('section', 'screen screen-title')
  title.appendChild(el('p', 'eyebrow', '色で仕分けるアクション'))
  title.appendChild(el('h2', 'title-logo', 'Bomb Sorter'))
  const rules = el('ul', 'rules')
  for (const t of [
    'ボムすけをドラッグして、同じ色の箱へ運ぶ',
    '違う箱に入れると爆発。導火線が尽きても爆発',
    '連続で成功すると連鎖して倍率が上がる',
  ]) {
    rules.appendChild(el('li', undefined, t))
  }
  title.appendChild(rules)
  const titleBest = el('p', 'best', '')
  title.appendChild(titleBest)
  const startBtn = button('ゲーム開始', 'primary', 'play_arrow')
  startBtn.addEventListener('click', () => emit('start'))
  title.appendChild(startBtn)
  title.appendChild(el('p', 'hint', '音が出ないときは、本体のマナーモードを確認してください'))

  // ---- ポーズ ----
  const paused = el('section', 'screen screen-paused')
  paused.appendChild(el('h2', undefined, '一時停止'))
  const resumeBtn = button('再開', 'primary', 'play_arrow')
  resumeBtn.addEventListener('click', () => emit('resume'))
  paused.appendChild(resumeBtn)
  const quitBtn = button('タイトルへ戻る', 'ghost', 'home')
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

  // ---- 縦持ちの案内 ----
  // 横持ち前提のレイアウトなので、縦のままだと箱が近すぎて遊びにならない
  const rotate = el('section', 'screen screen-rotate')
  const rotIcon = createIcon('screen_rotation', 56)
  rotIcon.classList.add('rotate-icon')
  rotate.appendChild(rotIcon)
  rotate.appendChild(el('h2', undefined, '横向きにしてください'))
  rotate.appendChild(el('p', 'hint', 'ボムすけを左右の箱に振り分けるので、横持ちで遊びます'))

  const screens = [title, paused, over, rotate]
  // 画面が開いたときのフォーカス先。ボタンに当てると起動直後から派手なリングが出て
  // タッチ利用者には不自然なので、節そのものを受け皿にする
  for (const s of screens) {
    s.tabIndex = -1
    s.setAttribute('role', 'group')
    root.appendChild(s)
  }

  let shown = ''

  return {
    update(world, best, bestCombo, portrait) {
      const phase = world.phase
      const key = `${phase}|${world.score}|${best}|${world.bestCombo}|${world.deathReason ?? ''}|${portrait}`
      if (key === shown) return
      shown = key

      const modal = phase === 'title' || phase === 'paused' || phase === 'gameover'
      const visible = modal || portrait
      root.classList.toggle('is-open', visible)
      // プレイ中はオーバーレイを完全に無効化して、指がボムに届くようにする
      root.setAttribute('aria-hidden', visible ? 'false' : 'true')

      // 縦持ちの案内は他のどの画面より優先する
      rotate.hidden = !portrait
      title.hidden = portrait || phase !== 'title'
      paused.hidden = portrait || phase !== 'paused'
      over.hidden = portrait || phase !== 'gameover'

      titleBest.textContent = best > 0 ? `最高得点 ${best}（最高 ${bestCombo} 連鎖）` : ''

      if (phase === 'gameover') {
        reason.textContent = DEATH_TEXT[world.deathReason ?? ''] ?? ''
        scoreBig.textContent = String(world.score)
        const isNew = world.score > 0 && world.score >= best
        stats.textContent = isNew
          ? `新記録！ ボムすけ ${world.sorted} 体 仕分け / 最高 ${world.bestCombo} 連鎖`
          : `ボムすけ ${world.sorted} 体 仕分け / 最高 ${world.bestCombo} 連鎖 / 最高得点 ${best}`
      }

      // 開いた画面へフォーカスを移す。読み上げが今どの画面かを伝えられるようにする
      if (visible) {
        const section = portrait
          ? rotate
          : phase === 'title'
            ? title
            : phase === 'paused'
              ? paused
              : over
        if (!section.contains(document.activeElement)) {
          section.focus({ preventScroll: true })
        }
      }
    },

    onCommand(cb) {
      listeners.push(cb)
    },

    isOpen() {
      return root.classList.contains('is-open')
    },
  }
}
