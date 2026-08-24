/** 実行時に変わる環境フラグ。静的な数値は constants.ts に置き、ここには混ぜない */
export interface RuntimeFlags {
  reducedMotion: boolean
}

export function watchReducedMotion(onChange: (v: boolean) => void): RuntimeFlags {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const flags: RuntimeFlags = { reducedMotion: mq.matches }
  mq.addEventListener('change', (e) => {
    flags.reducedMotion = e.matches
    onChange(e.matches)
  })
  return flags
}

/**
 * 画面が隠れたことの検出。
 * iOS では visibilitychange が来ないことがあるので pagehide と blur も拾う。
 */
export function watchHidden(onHide: () => void): void {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onHide()
  })
  window.addEventListener('pagehide', onHide)
  window.addEventListener('blur', onHide)
}
