/**
 * 効果音の合成。音源ファイルは 1 つも持たない。
 *
 * 外部から取ってくる道をそもそも作らない（CSP で connect-src を絞っている）ため、
 * すべてその場でオシレータとノイズから作る。著作権も通信も発生しない。
 */

/** exponentialRampToValueAtTime に 0 は渡せないので、実質無音のこの値を使う */
const SILENT = 0.0001

export interface SynthCtx {
  ctx: AudioContext
  out: GainNode
  /** ノイズは毎回作ると重いので 1 度だけ作って使い回す */
  noise: AudioBuffer
}

export function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  // ここは音の質感を作るだけなので、再現性は要らない
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function envGain(s: SynthCtx, t0: number, peak: number, attack: number, decay: number): GainNode {
  const g = s.ctx.createGain()
  g.gain.setValueAtTime(SILENT, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + attack + decay)
  g.connect(s.out)
  return g
}

function tone(
  s: SynthCtx,
  type: OscillatorType,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  glideTo?: number
): void {
  const g = envGain(s, t0, peak, 0.006, dur)
  const o = s.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (glideTo !== undefined)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur * 0.8)
  o.connect(g)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

/** 掴んだ音。軽いクリック感 */
export function sfxGrab(s: SynthCtx, t0: number): void {
  tone(s, 'sine', 660, t0, 0.08, 0.12, 880)
}

/** 正解の 2 音 */
export function sfxDropOk(s: SynthCtx, t0: number): void {
  tone(s, 'triangle', 523.25, t0, 0.12, 0.18)
  tone(s, 'triangle', 784, t0 + 0.06, 0.14, 0.16)
}

const PENTA = [0, 2, 4, 7, 9]

/** コンボ音。連鎖数に応じてペンタトニックを上っていく */
export function sfxCombo(s: SynthCtx, t0: number, combo: number): void {
  const n = Math.min(Math.max(combo, 0), 14)
  const step = PENTA[n % 5] ?? 0
  const oct = Math.floor(n / 5)
  const freq = 523.25 * Math.pow(2, step / 12 + oct)

  const lp = s.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(3000, t0)
  lp.connect(s.out)

  const g = s.ctx.createGain()
  g.gain.setValueAtTime(SILENT, t0)
  g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.24)
  g.connect(lp)

  const o = s.ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(freq, t0)
  o.connect(g)
  o.start(t0)
  o.stop(t0 + 0.3)
}

/** 導火線の警告。心拍のような 2 連キック */
export function sfxWarn(s: SynthCtx, t0: number, level: 1 | 2): void {
  const peak = level === 2 ? 0.14 : 0.1
  for (const off of [0, 0.14]) {
    const lp = s.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(400, t0 + off)
    lp.connect(s.out)

    const g = s.ctx.createGain()
    g.gain.setValueAtTime(SILENT, t0 + off)
    g.gain.exponentialRampToValueAtTime(peak, t0 + off + 0.006)
    g.gain.exponentialRampToValueAtTime(SILENT, t0 + off + 0.1)
    g.connect(lp)

    const o = s.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(180, t0 + off)
    o.frequency.exponentialRampToValueAtTime(60, t0 + off + 0.09)
    o.connect(g)
    o.start(t0 + off)
    o.stop(t0 + off + 0.14)
  }
}

/** 爆発。ノイズのローパススイープ＋サブベース */
export function sfxExplode(s: SynthCtx, t0: number): void {
  const src = s.ctx.createBufferSource()
  src.buffer = s.noise
  src.playbackRate.value = 0.9 + Math.random() * 0.2

  const lp = s.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(3000, t0)
  lp.frequency.exponentialRampToValueAtTime(200, t0 + 0.4)

  const g = s.ctx.createGain()
  g.gain.setValueAtTime(0.5, t0)
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.6)

  src.connect(lp)
  lp.connect(g)
  g.connect(s.out)
  src.start(t0)
  src.stop(t0 + 0.7)

  const sub = s.ctx.createOscillator()
  const sg = s.ctx.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(90, t0)
  sub.frequency.exponentialRampToValueAtTime(30, t0 + 0.5)
  sg.gain.setValueAtTime(0.35, t0)
  sg.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.5)
  sub.connect(sg)
  sg.connect(s.out)
  sub.start(t0)
  sub.stop(t0 + 0.55)
}

/** ゲームオーバー。下降 4 音、最後は 2 声のうねり */
export function sfxGameover(s: SynthCtx, t0: number): void {
  const notes = [440, 349.23, 293.66, 220]
  notes.forEach((f, i) => {
    const last = i === notes.length - 1
    const dur = last ? 0.7 : 0.18
    tone(s, 'triangle', f, t0 + i * 0.18, dur, 0.16)
    if (last) {
      const g = envGain(s, t0 + i * 0.18, 0.1, 0.01, dur)
      const o = s.ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(f, t0 + i * 0.18)
      o.detune.setValueAtTime(8, t0 + i * 0.18)
      o.connect(g)
      o.start(t0 + i * 0.18)
      o.stop(t0 + i * 0.18 + dur + 0.05)
    }
  })
}

/** UI のタップ音 */
export function sfxUiTap(s: SynthCtx, t0: number): void {
  const lp = s.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(4000, t0)
  lp.connect(s.out)
  const g = s.ctx.createGain()
  g.gain.setValueAtTime(SILENT, t0)
  g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.004)
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.03)
  g.connect(lp)
  const o = s.ctx.createOscillator()
  o.type = 'square'
  o.frequency.setValueAtTime(1000, t0)
  o.connect(g)
  o.start(t0)
  o.stop(t0 + 0.05)
}

/** コンボが切れた音。少し落ちる 2 音 */
export function sfxComboLost(s: SynthCtx, t0: number): void {
  tone(s, 'sine', 392, t0, 0.1, 0.08)
  tone(s, 'sine', 294, t0 + 0.07, 0.12, 0.07)
}

/** タイトル BGM の 1 音を予約する。BPM に合わせて呼ばれる */
export function bgmNote(s: SynthCtx, t0: number, freq: number, dur: number, peak: number): void {
  tone(s, 'triangle', freq, t0, dur, peak)
}

/** ハイハット代わりの短いノイズ */
export function bgmHat(s: SynthCtx, t0: number, peak: number): void {
  const src = s.ctx.createBufferSource()
  src.buffer = s.noise
  src.playbackRate.value = 1.8
  const hp = s.ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.setValueAtTime(6000, t0)
  const g = s.ctx.createGain()
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.05)
  src.connect(hp)
  hp.connect(g)
  g.connect(s.out)
  src.start(t0, Math.random())
  src.stop(t0 + 0.06)
}

/** プレイ中の低音パルス（キック） */
export function pulseKick(s: SynthCtx, t0: number, peak: number): void {
  const g = s.ctx.createGain()
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.16)
  g.connect(s.out)
  const o = s.ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(120, t0)
  o.frequency.exponentialRampToValueAtTime(45, t0 + 0.14)
  o.connect(g)
  o.start(t0)
  o.stop(t0 + 0.2)
}
