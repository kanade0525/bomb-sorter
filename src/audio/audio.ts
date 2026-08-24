import {
  bgmHat,
  bgmNote,
  createNoiseBuffer,
  pulseKick,
  sfxCombo,
  sfxComboLost,
  sfxDropOk,
  sfxExplode,
  sfxGameover,
  sfxGrab,
  sfxUiTap,
  sfxWarn,
  type SynthCtx,
} from './synth'

export type SfxName =
  'grab' | 'ok' | 'combo' | 'warn' | 'explode' | 'gameover' | 'ui' | 'combo-lost'

/** title = タイトルの BGM、play = 低音パルスのみ、silent = 無音 */
export type AudioMode = 'title' | 'play' | 'silent'

export interface AudioEngine {
  /** ユーザー操作のハンドラ内から同期的に呼ぶこと */
  unlock(): void
  isUnlocked(): boolean
  setMuted(muted: boolean): void
  isMuted(): boolean
  play(name: SfxName, arg?: number): void
  setMode(mode: AudioMode, intensity?: number): void
  suspend(): void
  dispose(): void
}

/** 同じ音が連続で重なるのを防ぐ間隔（秒） */
const THROTTLE: Record<SfxName, number> = {
  grab: 0.03,
  ok: 0.03,
  combo: 0.03,
  warn: 0.4,
  explode: 0.2,
  gameover: 0.5,
  ui: 0.05,
  'combo-lost': 0.2,
}

/** タイトル BGM の 16 ステップ。乱数を使わず固定配列で持つ */
const TITLE_STEPS: (number | null)[] = [
  0,
  null,
  4,
  7,
  null,
  9,
  null,
  4,
  0,
  null,
  7,
  null,
  4,
  null,
  9,
  12,
]
const SCALE_ROOT = 261.63 // C4

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let bgmGain: GainNode | null = null
  let synth: SynthCtx | null = null
  let muted = false
  let mode: AudioMode = 'silent'
  let intensity = 0
  let timer: number | null = null
  let nextStepTime = 0
  let step = 0
  const lastPlayed = new Map<SfxName, number>()

  function ensure(): SynthCtx | null {
    if (synth) return synth
    if (!ctx) return null
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)
    bgmGain = ctx.createGain()
    bgmGain.gain.value = 0.5
    bgmGain.connect(master)
    synth = { ctx, out: master, noise: createNoiseBuffer(ctx) }
    return synth
  }

  function bgmSynth(): SynthCtx | null {
    const s = ensure()
    if (!s || !bgmGain) return null
    return { ctx: s.ctx, out: bgmGain, noise: s.noise }
  }

  /** ルックアヘッド。rAF は非アクティブタブで止まるので BGM は setInterval で回す */
  function tick(): void {
    if (!ctx || mode === 'silent') return
    const horizon = ctx.currentTime + 0.2
    const bpm = mode === 'title' ? 108 : 88 + Math.round(intensity * 44)
    const stepDur = mode === 'title' ? 60 / bpm / 2 : 60 / bpm

    if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05

    while (nextStepTime < horizon) {
      const s = bgmSynth()
      if (!s) return
      if (mode === 'title') {
        const semi = TITLE_STEPS[step % TITLE_STEPS.length]
        if (semi !== null && semi !== undefined) {
          bgmNote(s, nextStepTime, SCALE_ROOT * Math.pow(2, semi / 12), 0.22, 0.09)
        }
        if (step % 4 === 2) bgmHat(s, nextStepTime, 0.05)
        if (step % 8 === 0) bgmNote(s, nextStepTime, SCALE_ROOT / 2, 0.3, 0.1)
      } else {
        pulseKick(s, nextStepTime, 0.12 + intensity * 0.06)
      }
      nextStepTime += stepDur
      step++
    }
  }

  function startTimer(): void {
    if (timer !== null) return
    timer = window.setInterval(tick, 25)
  }

  function stopTimer(): void {
    if (timer === null) return
    window.clearInterval(timer)
    timer = null
  }

  return {
    unlock() {
      // ここで await を挟むと iOS でジェスチャ由来と見なされず失敗する。同期的に呼ぶ
      if (!ctx) {
        try {
          ctx = new AudioContext()
        } catch {
          return
        }
      }
      void ctx.resume()
      const s = ensure()
      if (s) {
        // 古い iOS 向け。無音 1 サンプルを 1 度鳴らして経路を開く
        const src = ctx.createBufferSource()
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
        src.connect(ctx.destination)
        src.start(0)
      }
      if (mode !== 'silent') startTimer()
    },

    isUnlocked() {
      return ctx !== null && ctx.state === 'running'
    },

    setMuted(v) {
      muted = v
      if (!ctx || !master) return
      // 急に 0 にするとクリックノイズが出るのでランプさせる
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(master.gain.value, t)
      master.gain.linearRampToValueAtTime(v ? 0 : 1, t + 0.02)
    },

    isMuted() {
      return muted
    },

    play(name, arg) {
      const s = ensure()
      if (!s || !ctx || ctx.state !== 'running' || muted) return
      const now = ctx.currentTime
      const last = lastPlayed.get(name) ?? -1
      if (now - last < THROTTLE[name]) return
      lastPlayed.set(name, now)

      // 0 を開始時刻にするとクリックノイズになるので少し先へ置く
      const t0 = now + 0.005
      switch (name) {
        case 'grab':
          sfxGrab(s, t0)
          break
        case 'ok':
          sfxDropOk(s, t0)
          break
        case 'combo':
          sfxCombo(s, t0, arg ?? 0)
          break
        case 'warn':
          sfxWarn(s, t0, arg === 2 ? 2 : 1)
          break
        case 'explode':
          sfxExplode(s, t0)
          break
        case 'gameover':
          sfxGameover(s, t0)
          break
        case 'ui':
          sfxUiTap(s, t0)
          break
        case 'combo-lost':
          sfxComboLost(s, t0)
          break
      }
    },

    setMode(next, level = 0) {
      intensity = Math.min(Math.max(level, 0), 1)
      if (next === mode) return
      mode = next
      step = 0
      nextStepTime = 0
      if (mode === 'silent') stopTimer()
      else if (ctx && ctx.state === 'running') startTimer()
    },

    suspend() {
      stopTimer()
      if (ctx && ctx.state === 'running') void ctx.suspend()
    },

    dispose() {
      stopTimer()
      if (ctx) void ctx.close()
      ctx = null
      synth = null
      master = null
      bgmGain = null
    },
  }
}
