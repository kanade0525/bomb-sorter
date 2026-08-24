import { registerSW } from 'virtual:pwa-register'

/**
 * Service Worker の登録。
 *
 * 更新は自動で取り込むがリロードは押されたときだけ行う。
 * プレイ中に勝手にリロードされるとスコアが飛ぶので skipWaiting は無条件に呼ばない。
 */
export function setupPwa(toast: HTMLElement, action: HTMLButtonElement): void {
  if (!('serviceWorker' in navigator)) return

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast.hidden = false
    },
    onRegisterError(err: unknown) {
      console.warn('Service Worker の登録に失敗しました', err)
    },
  })

  action.addEventListener('click', () => {
    toast.hidden = true
    void update(true)
  })
}
