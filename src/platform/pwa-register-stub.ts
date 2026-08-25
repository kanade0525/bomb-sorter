/**
 * YouTube ゲームルーム向けビルドで、`virtual:pwa-register` の代わりに使う空実装。
 *
 * ゲームルームでは配信も更新もプラットフォームが持っているので Service Worker は
 * 要らない。PWA プラグイン自体を外すと仮想モジュールが解決できなくなるため、
 * 同じ形の何もしない関数をここに置いて差し替える（vite.config.ts の alias）。
 */
export function registerSW(_options?: {
  immediate?: boolean
  onNeedRefresh?: () => void
  onRegisterError?: (error: unknown) => void
}): (reload?: boolean) => Promise<void> {
  return async () => {}
}
