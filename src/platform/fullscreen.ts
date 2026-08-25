/**
 * 画面をできるだけ広く使うための処理。
 *
 * ブラウザの UI（アドレスバーやタブバー）に描画領域を削られると、
 * 横持ちでは特に上下が窮屈になる。環境ごとに使える手段が違うので、
 * 「全画面 API が使えるか」「すでに全画面相当か」を切り分けて扱う。
 *
 * iPhone の Safari は要素の全画面表示に対応していない（動画だけ別枠）。
 * その環境では、ホーム画面に追加してもらうのが唯一の全画面手段になる。
 */

export interface FullscreenSupport {
  /** requestFullscreen が使えるか */
  api: boolean
  /** すでにブラウザ UI の無い状態で動いているか（ホーム画面から起動した等） */
  standalone: boolean
}

export function detectSupport(): FullscreenSupport {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>
  }
  const api = Boolean(document.fullscreenEnabled && el.requestFullscreen)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // iOS の Safari は display-mode を返さないことがあるので、独自のフラグも見る
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return { api, standalone }
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null
}

/**
 * 全画面へ入る。ついでに横向きに固定できるなら固定する。
 * どちらもユーザー操作のハンドラから呼ぶこと。
 */
export async function enterFullscreen(target: HTMLElement): Promise<void> {
  try {
    await target.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    // 使えない環境や、ユーザー操作起点でないときは黙って諦める
    return
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>
    }
    await orientation.lock?.('landscape')
  } catch {
    // 向きの固定は対応していない環境の方が多い。できなくても遊べる
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch {
    // 閉じられなくても実害はない
  }
}

/** 全画面の出入りを監視する */
export function watchFullscreen(onChange: (full: boolean) => void): void {
  document.addEventListener('fullscreenchange', () => onChange(isFullscreen()))
}
