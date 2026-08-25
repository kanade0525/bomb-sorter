import { readRaw, writeRaw } from './storage'

/**
 * ゲームを載せている「場」との境目。
 *
 * 素のウェブページとして開かれた場合と、YouTube ゲームルーム（Playables）の中で
 * 動く場合とで、保存・音量・一時停止・記録の送り先が変わる。ゲーム側にその分岐を
 * 撒くと収拾がつかなくなるので、ここで 1 つの形に均しておく。
 *
 * Playables では、ミュートも一時停止も全画面もプラットフォーム側が持っている。
 * 認定要件で「プラットフォームの操作ボタンに似たものをゲーム内に置くな」と
 * されているので、ownsControls が true のときはゲーム側のボタンを出さない。
 *
 * SDK の仕様:
 *   https://developers.google.com/youtube/gaming/playables/reference/sdk
 */

export interface Host {
  readonly kind: 'browser' | 'playables'
  /** プラットフォームが音量・一時停止・全画面の操作を持っているか */
  readonly ownsControls: boolean

  /** 最初のフレームを描いたことを伝える。Playables では必須 */
  firstFrameReady(): void
  /** 遊べる状態になったことを伝える。Playables では必須 */
  gameReady(): void

  /** 保存データを読む。無ければ null */
  load(): Promise<string | null>
  save(data: string): Promise<void>

  isAudioEnabled(): boolean
  onAudioEnabledChange(cb: (enabled: boolean) => void): void

  onPause(cb: () => void): void
  onResume(cb: () => void): void

  /** 記録を送る。素のウェブでは何もしない */
  sendScore(score: number): void

  /** BCP-47 の言語タグ */
  getLanguage(): Promise<string>

  logError(error: unknown): void
}

/** YouTube ゲームルームの SDK が生やすグローバル。使える分だけを写した型 */
interface YtGame {
  game: {
    firstFrameReady(): void
    gameReady(): void
    loadData(): Promise<string>
    saveData(data: string): Promise<void>
  }
  system: {
    isAudioEnabled(): boolean
    onAudioEnabledChange(cb: (enabled: boolean) => void): () => void
    onPause(cb: () => void): () => void
    onResume(cb: () => void): () => void
    getLanguage(): Promise<string>
  }
  engagement: {
    sendScore(score: { value: number }): Promise<void>
  }
  health: {
    logError(): void
    logWarning(): void
  }
}

declare global {
  interface Window {
    ytgame?: YtGame
  }
}

/** 素のウェブページとして動くときの実装 */
export function createBrowserHost(storageKey: string): Host {
  let audioEnabled = true
  return {
    kind: 'browser',
    // 素のウェブではプラットフォームが何も持っていないので、ゲーム側がボタンを出す
    ownsControls: false,

    firstFrameReady() {},
    gameReady() {},

    async load() {
      return readRaw(storageKey)
    },

    async save(data) {
      writeRaw(storageKey, data)
    },

    isAudioEnabled() {
      return audioEnabled
    },

    onAudioEnabledChange(cb) {
      // 素のウェブでは、ゲーム内のミュートボタンがこの状態を持つ
      audioChangeListeners.push((v) => {
        audioEnabled = v
        cb(v)
      })
    },

    onPause(cb) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cb()
      })
      window.addEventListener('pagehide', cb)
      window.addEventListener('blur', cb)
    },

    onResume(cb) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) cb()
      })
    },

    sendScore() {},

    async getLanguage() {
      return navigator.language || 'en'
    },

    logError(error) {
      console.warn(error)
    },
  }
}

/** 素のウェブでのミュート操作を、onAudioEnabledChange の購読者へ流すための受け口 */
const audioChangeListeners: ((enabled: boolean) => void)[] = []

/** ゲーム内のミュートボタンが押されたときに呼ぶ（素のウェブ用） */
export function notifyAudioEnabled(enabled: boolean): void {
  for (const f of audioChangeListeners) f(enabled)
}

/** YouTube ゲームルームの中で動くときの実装 */
export function createPlayablesHost(yt: YtGame): Host {
  return {
    kind: 'playables',
    // ミュートも一時停止も全画面もプラットフォームが持っている。
    // 似たボタンをゲーム内に置くことは認定要件で禁じられている
    ownsControls: true,

    firstFrameReady() {
      yt.game.firstFrameReady()
    },
    gameReady() {
      yt.game.gameReady()
    },

    async load() {
      try {
        const data = await yt.game.loadData()
        return data.length > 0 ? data : null
      } catch {
        return null
      }
    },

    async save(data) {
      try {
        await yt.game.saveData(data)
      } catch {
        // 保存できないだけ。ゲームは続行する
      }
    },

    isAudioEnabled() {
      try {
        return yt.system.isAudioEnabled()
      } catch {
        return true
      }
    },

    onAudioEnabledChange(cb) {
      yt.system.onAudioEnabledChange(cb)
    },

    onPause(cb) {
      yt.system.onPause(cb)
    },

    onResume(cb) {
      yt.system.onResume(cb)
    },

    sendScore(score) {
      // 安全な整数の範囲に収める。範囲外は SDK 側で弾かれる
      const value = Math.min(Math.max(Math.floor(score), 0), Number.MAX_SAFE_INTEGER)
      void yt.engagement.sendScore({ value }).catch(() => {
        // 送れなくても遊びには影響しない
      })
    },

    async getLanguage() {
      try {
        return await yt.system.getLanguage()
      } catch {
        return 'en'
      }
    },

    logError() {
      try {
        yt.health.logError()
      } catch {
        // 記録できなくても続行する
      }
    },
  }
}

/**
 * 今どちらの場にいるかを見て、対応する実装を返す。
 *
 * SDK が無いときは素のウェブとして動く。こうしておくと、Playables 向けの
 * ビルドでも手元でそのまま開いて確かめられる。
 */
export function detectHost(storageKey: string): Host {
  const yt = window.ytgame
  if (yt && yt.game && typeof yt.game.firstFrameReady === 'function') {
    return createPlayablesHost(yt)
  }
  return createBrowserHost(storageKey)
}
