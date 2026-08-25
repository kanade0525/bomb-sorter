import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages のサブパス配信。末尾スラッシュ必須。
// dev サーバも同じパス（http://localhost:5173/bomb-sorter/）で動かして、
// import.meta.env.BASE_URL が dev と本番で常に一致する状態にしておく。
// ここを './' にすると Service Worker の登録 URL がバンドル JS の位置基準で
// 解決されてスコープが壊れるので、絶対パスで固定する。
const BASE = '/bomb-sorter/'

/**
 * YouTube ゲームルーム（Playables）向けのビルドかどうか。
 * `PLAYABLES=1 npm run build:playables` で切り替わる。
 *
 * 違いは 3 つ。
 *  1. 絶対パスが禁じられている（MUST）ので base を相対にする
 *  2. SDK をゲームコードより前に読み込む必要がある
 *  3. Service Worker は要らない。配信も更新も向こうが持っている
 */
const PLAYABLES = process.env['PLAYABLES'] === '1'

/** SDK の読み込み元。ゲームコードより前に置く決まりになっている */
const SDK_URL = 'https://www.youtube.com/game_api/v1'

/**
 * 本番の HTML にだけ CSP を差し込むプラグイン。
 *
 * GitHub Pages はレスポンスヘッダを指定できないので meta で効かせる。
 * connect-src 'none' にして「外へ通信が出ていかない」を宣言ではなく不変条件にする
 * （スコアは localStorage のみ、音は合成、フォントは system-ui なので外部通信は要らない）。
 * dev では入れない。Vite の HMR がインラインスタイルと WebSocket を使うため。
 */
const CSP = [
  "default-src 'none'",
  // ゲームルームでは SDK を向こうのドメインから読み込むので、そこだけ許す
  PLAYABLES ? `script-src 'self' https://www.youtube.com` : "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  // 素のウェブでは外へ出ていく道を塞ぐ。ゲームルームでは SDK が通信する
  PLAYABLES ? 'connect-src https://www.youtube.com' : "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // frame-ancestors / sandbox / report-uri は meta では無視されるので入れない。
  // 入れるとブラウザがコンソールに警告を出すだけで、効果はない。
].join('; ')

function cspPlugin() {
  return {
    name: 'bomb-sorter-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      let head = `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      // SDK は必ずゲームコードより前に読み込む。あとに置くと ytgame が未定義のまま起動する
      if (PLAYABLES) head += `\n    <script src="${SDK_URL}"></script>`
      return html.replace('<head>', head)
    },
  }
}

export default defineConfig({
  // ゲームルームは絶対パスを禁じている（MUST）。相対で吐く
  base: PLAYABLES ? './' : BASE,
  resolve: {
    // PWA プラグインを外すと virtual:pwa-register が解決できなくなるので、
    // 何もしない実装に差し替える
    alias: PLAYABLES ? { 'virtual:pwa-register': '/src/platform/pwa-register-stub.ts' } : {},
  },
  build: {
    target: 'es2022',
    // ゲームルーム向けはバンドルに含まれるファイル数と容量を絞る
    sourcemap: !PLAYABLES,
    outDir: PLAYABLES ? 'dist-playables' : 'dist',
    emptyOutDir: true,
  },
  plugins: [
    cspPlugin(),
    // ゲームルームでは配信も更新も向こうが持っているので Service Worker は入れない
    ...(PLAYABLES
      ? []
      : [
          VitePWA({
            // 更新は自動で取り込むが、リロードは押されたときだけ行う（prompt）。
            // プレイ中に勝手にリロードされるとスコアが飛ぶため autoUpdate にしない。
            registerType: 'prompt',
            injectRegister: null,
            manifest: {
              name: 'Bomb Sorter',
              short_name: 'BombSorter',
              description: '歩き回るボムすけを色で仕分ける横持ちアクション',
              lang: 'ja',
              // base 配下を指す。'/' にするとホーム画面から起動して 404 になる。
              start_url: BASE,
              scope: BASE,
              // ホーム画面から起動したときはブラウザの UI を一切出さない。
              // fullscreen に対応していない環境では standalone へ落ちる
              display: 'fullscreen',
              display_override: ['fullscreen', 'standalone'],
              // 縦持ちでも横持ちでも遊べるので、向きは固定しない
              orientation: 'any',
              background_color: '#0d0f14',
              theme_color: '#0d0f14',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'icons/maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
              navigateFallback: `${BASE}index.html`,
              cleanupOutdatedCaches: true,
              // 更新の適用はユーザー操作を待つ
              skipWaiting: false,
              clientsClaim: false,
            },
            devOptions: { enabled: false },
          }),
        ]),
  ],
  test: {
    // 純粋ロジックしかテストしないので jsdom は不要
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/core/**', 'src/game/**', 'src/view/layout.ts', 'src/platform/highscore.ts'],
    },
  },
})
