import type { Command, Layout, World } from '../core/types'

/**
 * E2E から観測・操作するための窓。
 *
 * 本番ビルドでも残す判断をしている。理由は 2 つ。
 *  1. 「テストしたビルド」と「配るビルド」を完全に同一にできる。公開URL そのものに
 *     スモークテストを流せるので、デバッグ版だけ動くという最悪の事態を構造的に防げる。
 *  2. ローカルのスコアしか持たないゲームで、隠すべき秘密が何もない。ソースも全公開。
 * オンラインランキングを付けるときは、この公開を 1 行のガードで閉じればよい。
 */
export interface TestHook {
  readonly version: 1
  getState(): World
  getLayout(): Layout
  /** rAF を止めて手動制御へ。E2E は最初にこれを呼ぶ */
  freeze(): void
  unfreeze(): void
  /** freeze 中に指定ミリ秒だけ決定的に進める */
  advance(ms: number): void
  command(cmd: Command): void
  reset(seed: number): void
  setMuted(muted: boolean): void
}

declare global {
  interface Window {
    __BOMB_SORTER__?: TestHook
  }
}

export function installTestHook(hook: TestHook): void {
  window.__BOMB_SORTER__ = hook
}
