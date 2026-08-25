import './style.css'

import { createAudio } from './audio/audio'
import { createLoop } from './app/loop'
import type { Command, World } from './core/types'
import { installTestHook } from './debug/testhook'
import { applyCommand, releaseAllDrags, stepWorld } from './game/step'
import { createWorld } from './game/world'
import { createKeyboardInput } from './input/keyboard'
import { createPointerInput } from './input/pointer'
import { watchHidden, watchReducedMotion } from './platform/media'
import { mergeBest } from './platform/highscore'
import {
  detectSupport,
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  watchFullscreen,
} from './platform/fullscreen'
import { setupPwa } from './platform/pwa'
import { loadSave, saveSave } from './platform/storage'
import { createFx, fxMiss, fxPop, fxRing, fxShake, updateFx } from './view/draw-fx'
import { COLOR, styleOf } from './view/palette'
import { createFloorCache } from './view/draw-floor'
import { render } from './view/renderer'
import { createSafeAreaProbe, measureViewport, type Viewport } from './view/viewport'
import type { Insets } from './view/layout'
import { createOverlay } from './ui/overlay'
import { setIcon } from './ui/icons'

/** 必須要素の取得。無ければ起動しない方が原因が分かりやすい */
function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`必要な要素が見つかりません: ${selector}`)
  return el
}

const canvas = must<HTMLCanvasElement>('#game')
const hudButtons = must<HTMLElement>('#hud-buttons')
const stage = must<HTMLElement>('#stage')
const fullscreenBtn = must<HTMLButtonElement>('#btn-fullscreen')
const overlayRoot = must<HTMLElement>('#overlay')
const muteBtn = must<HTMLButtonElement>('#btn-mute')
const pauseBtn = must<HTMLButtonElement>('#btn-pause')
const srStatus = must<HTMLElement>('#sr-status')
const srAlert = must<HTMLElement>('#sr-alert')
const toast = document.querySelector<HTMLElement>('#toast')
const toastAction = document.querySelector<HTMLButtonElement>('#toast-action')

const ctx = canvas.getContext('2d', { alpha: false })
if (!ctx) throw new Error('Canvas 2D が使えません')
const ctx2d: CanvasRenderingContext2D = ctx

const params = new URLSearchParams(location.search)
const seedParam = Number(params.get('seed'))
const seed = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : Date.now() & 0x7fffffff

/**
 * safe-area を URL から差し込めるようにしている（`?insets=47,0,34,0`）。
 * env() はブラウザの自動化から設定できないため、これが無いとノッチ端末の
 * レイアウトを手元で検分できず、実機を触るまで気づけない。
 */
function parseInsets(raw: string | null): Insets | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map((v) => Number.parseFloat(v))
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return undefined
  const [top, right, bottom, left] = parts as [number, number, number, number]
  const c = (v: number) => Math.min(Math.max(v, 0), 80)
  return { top: c(top), right: c(right), bottom: c(bottom), left: c(left) }
}

const insetsOverride = parseInsets(params.get('insets'))
const probe = createSafeAreaProbe()
let vp: Viewport = measureViewport(canvas, probe, insetsOverride)

// 保存データは可変で持ち、書き戻しは persist() 一本に集約する。
// 起動時のスナップショットを使い回すと plays が巻き戻る
const save = loadSave()
let best = save.best
let bestCombo = save.bestCombo

function persist(): void {
  save.best = best
  save.bestCombo = bestCombo
  save.muted = audio.isMuted()
  saveSave(save)
}

const fx = createFx()
const floor = createFloorCache()
const audio = createAudio()
const flags = watchReducedMotion(() => undefined)
let world: World = createWorld(seed, vp.layout)

const overlay = createOverlay(overlayRoot)

const pointer = createPointerInput(canvas, () => vp)

const startedAt = performance.now()
let renderTime = 0
let prevPhase = world.phase
let srTimer = 0
let recorded = false

/**
 * 操作の入口。ボタンでもキーでも必ずここを通す。
 * 「今の画面で押したらこうなってほしい」の解決をここ 1 か所に閉じ込める
 * （ポーズ中の pause は再開、ゲームオーバー中の開始はリトライ）。
 */
function command(cmd: Command): void {
  audio.unlock()
  audio.play('ui')
  let resolved: Command = cmd
  if (cmd === 'pause' && world.phase === 'paused') resolved = 'resume'
  if (cmd === 'start' && world.phase === 'gameover') resolved = 'restart'
  applyCommand(world, resolved, vp.layout)
}

function intensity(): number {
  return Math.min(1, world.time / 180)
}

/** 純粋レイヤが積んだ「起きたこと」を音と演出へ配る */
function drainEffects(): void {
  for (const e of world.effects) {
    switch (e.t) {
      case 'grab':
        audio.play('grab')
        break
      case 'ok': {
        audio.play('ok')
        if (e.combo >= 3) audio.play('combo', e.combo)
        const st = styleOf(e.kind)
        fxRing(fx, e.x, e.y, st.binEdge)
        // 落とした点は指の真下なので、文字は上へ逃がす。
        // 色を形依存にすると square の暗い色で読めなくなるので固定色にする
        fxPop(fx, e.x, e.y - 58, `+${e.gain}`, COLOR.text)
        if (e.combo >= 3) fxPop(fx, e.x, e.y - 84, `${e.combo} 連鎖`, COLOR.accent, 13)
        break
      }
      case 'miss':
        fxMiss(fx, e.x, e.y, e.kind, flags.reducedMotion)
        audio.play('explode')
        break
      case 'combo-lost':
        audio.play('combo-lost')
        break
      case 'warn':
        audio.play('warn', e.level)
        break
      case 'spawn':
        if (!flags.reducedMotion) fxRing(fx, e.x, e.y, COLOR.fieldEdge)
        break
    }
  }
  world.effects.length = 0
}

function onPhaseChanged(from: string, to: string): void {
  if (to === 'gameover') {
    audio.play('gameover')
    if (!recorded) {
      recorded = true
      const merged = mergeBest({ ...save, best, bestCombo }, world.score, world.bestCombo)
      best = merged.best
      bestCombo = merged.bestCombo
      save.plays = merged.plays
      persist()
    }
    srAlert.textContent = `ゲームオーバー。スコア ${world.score}、ハイスコア ${best}`
  }
  if (to === 'ready' && from !== 'paused') recorded = false
  if (to === 'title') audio.setMode('title')
  else if (to === 'playing' || to === 'ready') audio.setMode('play', intensity())
  else if (to === 'gameover') audio.setMode('silent')

  pauseBtn.disabled = to !== 'playing' && to !== 'ready' && to !== 'paused'
  syncPauseButton()
}

function step(dt: number): void {
  const actions = pointer.drain()
  stepWorld(world, dt, actions, vp.layout)
  drainEffects()
  updateFx(fx, dt)

  if (world.phase !== prevPhase) {
    onPhaseChanged(prevPhase, world.phase)
    prevPhase = world.phase
    if (world.phase === 'exploding' && !flags.reducedMotion) fxShake(fx, 10)
  }

  if (world.phase === 'playing') audio.setMode('play', intensity())

  // 読み上げは 1 秒に 1 回だけ。毎フレーム更新するとスクリーンリーダーが破綻する
  srTimer += dt
  if (srTimer >= 1) {
    srTimer = 0
    if (world.phase === 'playing') {
      srStatus.textContent = `スコア ${world.score}${world.combo > 1 ? `、${world.combo} れんさ` : ''}`
    }
  }
}

function draw(): void {
  // フレーム数で数えると 120Hz 端末で装飾のアニメが 2 倍速になるので実時間を使う。
  // ゲームの進行には一切関与しない、破線が流れる速さなどの見た目専用の時刻
  renderTime = (performance.now() - startedAt) / 1000
  render(ctx2d, { world, fx, vp, flags, best, t: renderTime, floor })
  overlay.update(world, best, bestCombo, vp.fit.portrait)

  // モーダルが出ている間の上部ボタンの扱い。
  //
  // 全部を inert にすると、タイトルやポーズ中にミュートが押せなくなる。
  // 音を切りたくなるのはまさにその場面なので、ミュートは常に押せるままにする。
  // 一方ポーズボタンは、ポーズ中は「つづける」と同じ機能のボタンが 2 つある状態を
  // 作ってしまい、タイトルとゲームオーバーでは意味を持たないので隠す。
  const modal = overlay.isOpen()
  if (pauseBtn.hidden !== modal) pauseBtn.hidden = modal
  hudButtons.classList.toggle('is-dimmed', modal)
}

const loop = createLoop(step, draw)

// ---- リサイズ ----
let resizeTimer = 0
function relayout(): void {
  const wasPortrait = vp.fit.portrait
  vp = measureViewport(canvas, probe, insetsOverride)
  // 横持ち前提のレイアウトなので、縦にされたらそのまま遊ばせない
  if (vp.fit.portrait && !wasPortrait && (world.phase === 'playing' || world.phase === 'ready')) {
    applyCommand(world, 'pause', vp.layout)
  }
  // 座標系が変わった時点で、掴んでいた指と判定の前提が食い違う。
  // 手放しておかないと、指を動かしていないのに離した瞬間に誤爆死する
  releaseAllDrags(world, vp.layout)
  // レイアウトが変わったので、シミュレーションの端数は捨てて矛盾を残さない
  loop.resetClock()
  syncHudButtonPlacement()
  draw()
}

/**
 * 上部のボタンを、レターボックスの内側（実際に描かれているゲーム画面の右上）へ寄せる。
 *
 * ボタンはビューポート基準の DOM なので、何もしないと iPad の横向きで
 * ゲーム画面から 250px 以上離れた黒帯の中に浮いてしまう。
 */
function syncHudButtonPlacement(): void {
  const { offsetX, offsetY, scale } = vp.fit
  // タップ領域は 44px を割らせたくないので、拡大方向にだけ少し追従させる
  const s = Math.min(Math.max(scale, 1), 1.4)
  hudButtons.style.transformOrigin = 'top right'
  hudButtons.style.transform = `translate(${-offsetX}px, ${offsetY}px) scale(${s})`
}
function scheduleRelayout(): void {
  window.clearTimeout(resizeTimer)
  // iOS はツールバーの出入りで何度も発火するのでデバウンスする
  resizeTimer = window.setTimeout(relayout, 100)
}
// canvas 自身の箱の変化を見る。起動直後にまだレイアウトされていない一瞬や、
// window の resize が飛ばない変化（親要素の都合など）もこれで拾える
new ResizeObserver(scheduleRelayout).observe(canvas)
window.addEventListener('resize', scheduleRelayout)
window.addEventListener('orientationchange', scheduleRelayout)
window.visualViewport?.addEventListener('resize', scheduleRelayout)
window.visualViewport?.addEventListener('scroll', scheduleRelayout)

// ---- 画面が隠れたら止める。復帰は自動でしない（復帰即爆死を避ける） ----
watchHidden(() => {
  if (world.phase === 'playing' || world.phase === 'ready') {
    applyCommand(world, 'pause', vp.layout)
  }
  audio.suspend()
})
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetClock()
})

// ---- ボタン ----
function syncMuteButton(): void {
  const m = audio.isMuted()
  muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false')
  muteBtn.setAttribute('aria-label', m ? '音を出す' : '音を消す')
  setIcon(muteBtn, m ? 'volume_off' : 'volume_up', 22)
}

/** ポーズボタンは、押したときに起きることをアイコンで示す */
function syncPauseButton(): void {
  const paused = world.phase === 'paused'
  pauseBtn.setAttribute('aria-label', paused ? '再開する' : '一時停止')
  setIcon(pauseBtn, paused ? 'play_arrow' : 'pause', 22)
}

function toggleMute(): void {
  audio.unlock()
  audio.setMuted(!audio.isMuted())
  syncMuteButton()
  persist()
}

// ---- 全画面 ----
// ブラウザの UI に描画領域を削られると、横持ちでは上下が特に窮屈になる。
// 全画面 API が使える環境ではボタンを出し、使えない環境（iPhone の Safari）では
// タイトルで「ホーム画面に追加すると全画面になる」と案内する
const fsSupport = detectSupport()

function syncFullscreenButton(): void {
  const full = isFullscreen()
  fullscreenBtn.hidden = !fsSupport.api || fsSupport.standalone
  fullscreenBtn.setAttribute('aria-label', full ? '全画面をやめる' : '全画面にする')
  setIcon(fullscreenBtn, full ? 'fullscreen_exit' : 'fullscreen', 22)
}

fullscreenBtn.addEventListener('click', () => {
  audio.unlock()
  audio.play('ui')
  if (isFullscreen()) void exitFullscreen()
  else void enterFullscreen(stage)
})
watchFullscreen(() => {
  syncFullscreenButton()
  scheduleRelayout()
})

audio.setMuted(save.muted)
syncMuteButton()
syncPauseButton()
syncFullscreenButton()
muteBtn.addEventListener('click', toggleMute)
pauseBtn.addEventListener('click', () => command('pause'))

overlay.onCommand(command)
createKeyboardInput({ onCommand: command, onToggleMute: toggleMute })

// ---- 音のアンロック。ユーザー操作のハンドラ内で同期的に resume する ----
const unlock = () => {
  audio.unlock()
  if (audio.isUnlocked()) {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
}
window.addEventListener('pointerdown', unlock, true)
window.addEventListener('keydown', unlock, true)

// ---- PWA ----
if (toast && toastAction) setupPwa(toast, toastAction)

// ---- テスト用フック ----
installTestHook({
  version: 1,
  getState: () => structuredClone(world),
  getLayout: () => structuredClone(vp.layout),
  freeze: () => loop.stop(),
  unfreeze: () => loop.start(),
  advance: (ms) => loop.advance(ms),
  command: (cmd) => applyCommand(world, cmd, vp.layout),
  reset: (s) => {
    world = createWorld(s, vp.layout)
    prevPhase = world.phase
    recorded = false
    draw()
  },
  setMuted: (m) => {
    audio.setMuted(m)
    syncMuteButton()
  },
})

// 全画面にできない環境では、ホーム画面へ追加すると広く使えることを伝える
overlay.setFullscreenHint(!fsSupport.api && !fsSupport.standalone)

audio.setMode('title')
onPhaseChanged('title', 'title')
syncHudButtonPlacement()
draw()
if (params.get('frozen') !== '1') loop.start()
