import type { Command, World } from '../core/types'
import { drawPixelText, measurePixelText, pixelTextHeight } from '../view/pixel-font'
import { createIcon, type IconName } from './icons'

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
  // 全画面 API が使えない環境（iPhone の Safari）向けの案内。
  // ホーム画面に追加すればブラウザの UI が消えて、描画領域が一回り広くなる
  const fsHint = el('p', 'hint hint-fullscreen')
  fsHint.appendChild(createIcon('add_to_home_screen', 16))
  fsHint.appendChild(el('span', undefined, 'ホーム画面に追加すると、画面をいっぱいに使えます'))
  fsHint.hidden = true
  title.appendChild(fsHint)

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
  const scoreBig = pixelNumber(9, '#e8ecf4')
  const scoreWrap = el('p', 'score-big')
  scoreWrap.appendChild(scoreBig.el)
  over.appendChild(scoreWrap)
  const stats = el('p', 'stats', '')
  over.appendChild(stats)
  const retryBtn = button('もう一度', 'primary', 'refresh')
  retryBtn.addEventListener('click', () => emit('restart'))
  over.appendChild(retryBtn)
  const backBtn = button('タイトルへ', 'ghost', 'home')
  backBtn.addEventListener('click', () => emit('title'))
  over.appendChild(backBtn)

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

      titleBest.textContent = best > 0 ? `最高得点 ${best}（最高 ${bestCombo} 連鎖）` : ''

      if (phase === 'gameover') {
        reason.textContent = DEATH_TEXT[world.deathReason ?? ''] ?? ''
        scoreBig.set(String(world.score))
        // 読み上げ用に、数字そのものは文字としても持たせておく
        scoreWrap.setAttribute('aria-label', `得点 ${world.score}`)
        scoreWrap.setAttribute('role', 'text')
        const isNew = world.score > 0 && world.score >= best
        stats.textContent = isNew
          ? `新記録！ ボムすけ ${world.sorted} 体 仕分け / 最高 ${world.bestCombo} 連鎖`
          : `ボムすけ ${world.sorted} 体 仕分け / 最高 ${world.bestCombo} 連鎖 / 最高得点 ${best}`
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
  }
}
