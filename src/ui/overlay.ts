import type { Command, World } from '../core/types'
import { drawPixelText, measurePixelText, pixelTextHeight } from '../view/pixel-font'
import { createIcon, type IconName } from './icons'
import { t } from './strings'

/**
 * 数字をドット字形で描いた小さな canvas を返す。
 *
 * 画面でいちばん大きく出る数字がシステムフォントのままだと、
 * まわりのピクセルの目から浮いてしまう。DOM の中でもドットで組む。
 */
function pixelNumber(
  dot: number,
  color: string
): {
  el: HTMLCanvasElement
  set: (text: string) => void
} {
  const el = document.createElement('canvas')
  el.className = 'pixel-number'
  el.setAttribute('aria-hidden', 'true')
  const set = (text: string) => {
    const w = Math.max(1, measurePixelText(text, dot))
    const h = pixelTextHeight(dot)
    // 実解像度で描いて、CSS では等倍で見せる。拡大されるとドットが甘くなる
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(w * ratio)
    el.height = Math.round(h * ratio)
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, w, h)
    drawPixelText(ctx, text, 0, 0, dot, color)
  }
  return { el, set }
}

/**
 * タイトル・ポーズ・ゲームオーバー・縦持ちの案内。
 *
 * Canvas に描かず DOM の実 button にしてあるのは、キーボード操作・フォーカスリング・
 * 読み上げが何もしなくても付いてくるから。innerHTML は使わず要素を組み立てる。
 */
export interface Overlay {
  update(world: World, best: number, bestCombo: number): void
  onCommand(cb: (cmd: Command) => void): void
  /** 何かしらの画面を出しているか。上部ボタンの扱いを決めるのに使う */
  isOpen(): boolean
  /** 全画面 API が使えない環境で、ホーム画面追加をすすめる案内を出すか */
  setFullscreenHint(show: boolean): void
  /**
   * 言葉を今の設定で貼り直す。
   * 言語は場から非同期に届くので、画面を組み立てたあとで変わることがある。
   */
  applyLanguage(): void
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

/** ボタンと、その文字を持つ要素。あとから言葉を貼り替えられるようにしておく */
function button(
  label: string,
  className: string,
  icon: IconName
): { el: HTMLButtonElement; label: HTMLSpanElement } {
  const b = el('button', className)
  b.type = 'button'
  b.appendChild(createIcon(icon, 22))
  const span = el('span', undefined, label)
  b.appendChild(span)
  return { el: b, label: span }
}

function deathText(reason: string | null): string {
  const s = t()
  return reason === 'wrong' ? s.deathWrong : reason === 'fuse' ? s.deathFuse : ''
}

export function createOverlay(root: HTMLElement): Overlay {
  const s = t()
  const listeners: ((cmd: Command) => void)[] = []
  const emit = (cmd: Command) => {
    for (const f of listeners) f(cmd)
  }

  // ---- タイトル ----
  const title = el('section', 'screen screen-title')
  const eyebrow = el('p', 'eyebrow', s.eyebrow)
  title.appendChild(eyebrow)
  title.appendChild(el('h2', 'title-logo', 'Bomb Sorter'))
  const rules = el('ul', 'rules')
  const ruleItems = s.rules.map((line) => {
    const li = el('li', undefined, line)
    rules.appendChild(li)
    return li
  })
  title.appendChild(rules)
  const titleBest = el('p', 'best', '')
  title.appendChild(titleBest)
  const startBtn = button(s.start, 'primary', 'play_arrow')
  startBtn.el.addEventListener('click', () => emit('start'))
  title.appendChild(startBtn.el)
  // 全画面 API が使えない環境（iPhone の Safari）向けの案内。
  // ホーム画面に追加すればブラウザの UI が消えて、描画領域が一回り広くなる
  const fsHint = el('p', 'hint hint-fullscreen')
  fsHint.appendChild(createIcon('add_to_home_screen', 16))
  const fsHintText = el('span', undefined, s.hintFullscreen)
  fsHint.appendChild(fsHintText)
  fsHint.hidden = true
  title.appendChild(fsHint)

  const audioHint = el('p', 'hint', s.hintAudio)
  title.appendChild(audioHint)

  // ---- ポーズ ----
  const paused = el('section', 'screen screen-paused')
  const pausedTitle = el('h2', undefined, s.paused)
  paused.appendChild(pausedTitle)
  const resumeBtn = button(s.resume, 'primary', 'play_arrow')
  resumeBtn.el.addEventListener('click', () => emit('resume'))
  paused.appendChild(resumeBtn.el)
  const quitBtn = button(s.backToTitleLong, 'ghost', 'home')
  quitBtn.el.addEventListener('click', () => emit('title'))
  paused.appendChild(quitBtn.el)

  // ---- ゲームオーバー ----
  const over = el('section', 'screen screen-over')
  const overTitle = el('h2', undefined, s.gameOver)
  over.appendChild(overTitle)
  const reason = el('p', 'reason', '')
  over.appendChild(reason)
  const scoreBig = pixelNumber(9, '#e8ecf4')
  const scoreWrap = el('p', 'score-big')
  scoreWrap.appendChild(scoreBig.el)
  over.appendChild(scoreWrap)
  const stats = el('p', 'stats', '')
  over.appendChild(stats)
  const retryBtn = button(s.retry, 'primary', 'refresh')
  retryBtn.el.addEventListener('click', () => emit('restart'))
  over.appendChild(retryBtn.el)
  const backBtn = button(s.backToTitle, 'ghost', 'home')
  backBtn.el.addEventListener('click', () => emit('title'))
  over.appendChild(backBtn.el)

  const screens = [title, paused, over]
  // 画面が開いたときのフォーカス先。ボタンに当てると起動直後から派手なリングが出て
  // タッチ利用者には不自然なので、節そのものを受け皿にする
  for (const s of screens) {
    s.tabIndex = -1
    s.setAttribute('role', 'group')
    root.appendChild(s)
  }

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

      const n = t()
      titleBest.textContent = best > 0 ? n.bestLine(best, bestCombo) : ''

      if (phase === 'gameover') {
        reason.textContent = deathText(world.deathReason)
        scoreBig.set(String(world.score))
        // 読み上げ用に、数字そのものは文字としても持たせておく
        scoreWrap.setAttribute('aria-label', `${n.score} ${world.score}`)
        scoreWrap.setAttribute('role', 'text')
        const isNew = world.score > 0 && world.score >= best
        stats.textContent = isNew
          ? n.statsNew(world.sorted, world.bestCombo)
          : n.stats(world.sorted, world.bestCombo, best)
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

    isOpen() {
      return root.classList.contains('is-open')
    },

    setFullscreenHint(show) {
      fsHint.hidden = !show
    },

    applyLanguage() {
      const n = t()
      eyebrow.textContent = n.eyebrow
      ruleItems.forEach((li, i) => {
        li.textContent = n.rules[i] ?? ''
      })
      startBtn.label.textContent = n.start
      fsHintText.textContent = n.hintFullscreen
      audioHint.textContent = n.hintAudio
      pausedTitle.textContent = n.paused
      resumeBtn.label.textContent = n.resume
      quitBtn.label.textContent = n.backToTitleLong
      overTitle.textContent = n.gameOver
      retryBtn.label.textContent = n.retry
      backBtn.label.textContent = n.backToTitle
      // 次の update で貼り直させる。同じ状態だと差分なしで飛ばしてしまう
      shown = ''
    },
  }
}
