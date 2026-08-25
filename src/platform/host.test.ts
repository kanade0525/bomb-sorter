import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserHost, createPlayablesHost, detectHost, notifyAudioEnabled } from './host'

/**
 * 場（素のウェブ / YouTube ゲームルーム）の差を吸収する層。
 *
 * ゲームルームの SDK は向こうの環境にしか無いので、同じ形の偽物を渡して
 * 「呼ぶべきものを呼んでいるか」「壊れても落ちないか」を見る。
 */

/** localStorage の代わり。例外を吐かせる切り替えつき */
function fakeStorage(opts: { throwOnWrite?: boolean; throwOnRead?: boolean } = {}) {
  const map = new Map<string, string>()
  return {
    getItem(k: string) {
      if (opts.throwOnRead) throw new Error('読めない')
      return map.get(k) ?? null
    },
    setItem(k: string, v: string) {
      if (opts.throwOnWrite) throw new Error('書けない')
      map.set(k, v)
    },
    removeItem(k: string) {
      map.delete(k)
    },
    clear() {
      map.clear()
    },
    key: () => null,
    length: 0,
  } as unknown as Storage
}

/** SDK の偽物。呼ばれた回数と引数を覚える */
function fakeYtGame() {
  const calls = {
    firstFrameReady: 0,
    gameReady: 0,
    saved: [] as string[],
    scores: [] as number[],
    errors: 0,
  }
  let stored = ''
  let audio = true
  const audioCbs: ((v: boolean) => void)[] = []
  const pauseCbs: (() => void)[] = []
  const resumeCbs: (() => void)[] = []

  const yt = {
    game: {
      firstFrameReady: () => {
        calls.firstFrameReady++
      },
      gameReady: () => {
        calls.gameReady++
      },
      loadData: async () => stored,
      saveData: async (d: string) => {
        calls.saved.push(d)
        stored = d
      },
    },
    system: {
      isAudioEnabled: () => audio,
      onAudioEnabledChange: (cb: (v: boolean) => void) => {
        audioCbs.push(cb)
        return () => {}
      },
      onPause: (cb: () => void) => {
        pauseCbs.push(cb)
        return () => {}
      },
      onResume: (cb: () => void) => {
        resumeCbs.push(cb)
        return () => {}
      },
      getLanguage: async () => 'ja-JP',
    },
    engagement: {
      sendScore: async (s: { value: number }) => {
        calls.scores.push(s.value)
      },
    },
    health: {
      logError: () => {
        calls.errors++
      },
      logWarning: () => {},
    },
  }

  return {
    yt,
    calls,
    setStored: (v: string) => {
      stored = v
    },
    fireAudio: (v: boolean) => {
      audio = v
      for (const cb of audioCbs) cb(v)
    },
    firePause: () => {
      for (const cb of pauseCbs) cb()
    },
    fireResume: () => {
      for (const cb of resumeCbs) cb()
    },
  }
}

describe('素のウェブの場', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { language: 'ja-JP' })
  })

  it('書いたものが読める', async () => {
    const host = createBrowserHost('k')
    await host.save('hello')
    expect(await host.load()).toBe('hello')
  })

  it('保存が無ければ null', async () => {
    expect(await createBrowserHost('k').load()).toBeNull()
  })

  it('書き込みが例外を投げても落ちない', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ throwOnWrite: true }))
    const host = createBrowserHost('k')
    await expect(host.save('x')).resolves.toBeUndefined()
  })

  it('読み込みが例外を投げても null を返す', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ throwOnRead: true }))
    expect(await createBrowserHost('k').load()).toBeNull()
  })

  it('プラットフォームは操作を持っていない（ゲーム側がボタンを出す）', () => {
    expect(createBrowserHost('k').ownsControls).toBe(false)
  })

  it('ready の通知は何もしないが、呼んでも落ちない', () => {
    const host = createBrowserHost('k')
    expect(() => {
      host.firstFrameReady()
      host.gameReady()
    }).not.toThrow()
  })

  it('記録の送信は何もしない', () => {
    expect(() => createBrowserHost('k').sendScore(100)).not.toThrow()
  })

  it('言語はブラウザの設定から取る', async () => {
    expect(await createBrowserHost('k').getLanguage()).toBe('ja-JP')
  })

  it('ミュートの切り替えが購読者へ届く', () => {
    const host = createBrowserHost('k')
    const seen: boolean[] = []
    host.onAudioEnabledChange((v) => seen.push(v))
    notifyAudioEnabled(false)
    notifyAudioEnabled(true)
    expect(seen).toEqual([false, true])
    expect(host.isAudioEnabled()).toBe(true)
  })
})

describe('YouTube ゲームルームの場', () => {
  it('ready の通知が SDK へ渡る', () => {
    const f = fakeYtGame()
    const host = createPlayablesHost(f.yt)
    host.firstFrameReady()
    host.gameReady()
    expect(f.calls.firstFrameReady).toBe(1)
    expect(f.calls.gameReady).toBe(1)
  })

  it('保存が SDK 経由になる', async () => {
    const f = fakeYtGame()
    const host = createPlayablesHost(f.yt)
    await host.save('{"best":10}')
    expect(f.calls.saved).toEqual(['{"best":10}'])
    expect(await host.load()).toBe('{"best":10}')
  })

  it('保存が空文字なら「無い」として扱う', async () => {
    const f = fakeYtGame()
    f.setStored('')
    expect(await createPlayablesHost(f.yt).load()).toBeNull()
  })

  it('プラットフォームが操作を持っている（ゲーム側はボタンを出さない）', () => {
    expect(createPlayablesHost(fakeYtGame().yt).ownsControls).toBe(true)
  })

  it('音量の変化が届く', () => {
    const f = fakeYtGame()
    const host = createPlayablesHost(f.yt)
    const seen: boolean[] = []
    host.onAudioEnabledChange((v) => seen.push(v))
    f.fireAudio(false)
    expect(seen).toEqual([false])
    expect(host.isAudioEnabled()).toBe(false)
  })

  it('一時停止と再開が届く', () => {
    const f = fakeYtGame()
    const host = createPlayablesHost(f.yt)
    let paused = 0
    let resumed = 0
    host.onPause(() => paused++)
    host.onResume(() => resumed++)
    f.firePause()
    f.fireResume()
    expect([paused, resumed]).toEqual([1, 1])
  })

  it('記録は整数に丸めて送る', () => {
    const f = fakeYtGame()
    const host = createPlayablesHost(f.yt)
    host.sendScore(1234.7)
    expect(f.calls.scores).toEqual([1234])
  })

  it('負の記録は 0 に、桁あふれは安全な整数に収める', () => {
    const f = fakeYtGame()
    const host = createPlayablesHost(f.yt)
    host.sendScore(-5)
    host.sendScore(Number.MAX_SAFE_INTEGER * 4)
    expect(f.calls.scores).toEqual([0, Number.MAX_SAFE_INTEGER])
  })

  it('言語は SDK から取る', async () => {
    expect(await createPlayablesHost(fakeYtGame().yt).getLanguage()).toBe('ja-JP')
  })

  it('SDK が例外を投げても落ちない', async () => {
    const broken = {
      game: {
        firstFrameReady: () => {
          throw new Error('壊れた')
        },
        gameReady: () => {},
        loadData: async () => {
          throw new Error('壊れた')
        },
        saveData: async () => {
          throw new Error('壊れた')
        },
      },
      system: {
        isAudioEnabled: () => {
          throw new Error('壊れた')
        },
        onAudioEnabledChange: () => () => {},
        onPause: () => () => {},
        onResume: () => () => {},
        getLanguage: async () => {
          throw new Error('壊れた')
        },
      },
      engagement: { sendScore: async () => {} },
      health: { logError: () => {}, logWarning: () => {} },
    }
    const host = createPlayablesHost(broken as never)
    expect(await host.load()).toBeNull()
    await expect(host.save('x')).resolves.toBeUndefined()
    expect(host.isAudioEnabled()).toBe(true)
    expect(await host.getLanguage()).toBe('en')
  })
})

describe('場の判別', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { language: 'en-US' })
  })

  it('SDK が無ければ素のウェブとして動く', () => {
    vi.stubGlobal('window', {})
    expect(detectHost('k').kind).toBe('browser')
  })

  it('SDK があればゲームルームとして動く', () => {
    const f = fakeYtGame()
    vi.stubGlobal('window', { ytgame: f.yt })
    expect(detectHost('k').kind).toBe('playables')
  })

  it('ytgame があっても中身が違えば素のウェブ扱いにする', () => {
    vi.stubGlobal('window', { ytgame: { game: {} } })
    expect(detectHost('k').kind).toBe('browser')
  })
})
