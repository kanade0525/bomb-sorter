import './style.css'

import { createAudio } from './audio/audio'
import { createLoop } from './app/loop'
import { TIMING } from './core/constants'
import type { Command, World } from './core/types'
import { installTestHook } from './debug/testhook'
import { applyCommand, stepWorld } from './game/step'
import { createWorld } from './game/world'
import { createKeyboardInput } from './input/keyboard'
import { createPointerInput } from './input/pointer'
import { watchHidden, watchReducedMotion } from './platform/media'
import { mergeBest } from './platform/highscore'
import { setupPwa } from './platform/pwa'
import { loadSave, saveSave } from './platform/storage'
import { createFx, fxMiss, fxPop, fxRing, fxShake, updateFx } from './view/draw-fx'
import { COLOR, styleOf } from './view/palette'
import { render } from './view/renderer'
import { createSafeAreaProbe, measureViewport, type Viewport } from './view/viewport'
import { createOverlay } from './ui/overlay'
import { setIcon } from './ui/icons'

/** 必須要素の取得。無ければ起動しない方が原因が分かりやすい */
function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`必要な要素が見つかりません: ${selector}`)
  return el
}

const canvas = must<HTMLCanvasElement>('#game')
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

const probe = createSafeAreaProbe()
let vp: Viewport = measureViewport(canvas, probe)

const save = loadSave()
let best = save.best
let bestCombo = save.bestCombo

const fx = createFx()
const audio = createAudio()
const flags = watchReducedMotion(() => undefined)
let world: World = createWorld(seed, vp.layout)

const overlay = createOverlay(overlayRoot)

const pointer = createPointerInput(canvas, () => vp)

let renderTime = 0
let prevPhase = world.phase
let srTimer = 0
let recorded = false

function command(cmd: Command): void {
  audio.unlock()
  audio.play('ui')
  applyCommand(world, cmd, vp.layout)
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
        fxRing(fx, e.x, e.y, st.zoneEdge)
        fxPop(fx, e.x, e.y, `+${e.gain}`, COLOR.accent)
        if (e.combo >= 3) fxPop(fx, e.x, e.y - 22, `${e.combo} れんさ`, st.bodyLight, 13)
        break
      }
      case 'miss': {
        const kind = world.bombs.find((b) => b.x === e.x && b.y === e.y)?.kind ?? 'round'
        fxMiss(fx, e.x, e.y, kind, flags.reducedMotion)
        audio.play('explode')
        break
      }
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
      saveSave({ ...merged, muted: audio.isMuted() })
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
  renderTime += TIMING.FIXED_DT
  render(ctx2d, { world, fx, vp, flags, best, t: renderTime })
  overlay.update(world, best, bestCombo)
}

const loop = createLoop(step, draw)

// ---- リサイズ ----
let resizeTimer = 0
function relayout(): void {
  vp = measureViewport(canvas, probe)
  // レイアウトが変わったので、シミュレーションの端数は捨てて矛盾を残さない
  loop.resetClock()
  draw()
}
function scheduleRelayout(): void {
  window.clearTimeout(resizeTimer)
  // iOS はツールバーの出入りで何度も発火するのでデバウンスする
  resizeTimer = window.setTimeout(relayout, 100)
}
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
  saveSave({ best, bestCombo, muted: audio.isMuted(), plays: save.plays })
}

audio.setMuted(save.muted)
syncMuteButton()
syncPauseButton()
muteBtn.addEventListener('click', toggleMute)
pauseBtn.addEventListener('click', () => {
  command(world.phase === 'paused' ? 'resume' : 'pause')
})

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

audio.setMode('title')
onPhaseChanged('title', 'title')
draw()
if (params.get('frozen') !== '1') loop.start()
