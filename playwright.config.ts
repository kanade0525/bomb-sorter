import { defineConfig, devices } from '@playwright/test'

// base 込みの URL。末尾スラッシュを付けて page.goto('./') が効くようにする。
// 公開後のスモークテストは PLAYWRIGHT_BASE_URL で本番 URL に向ける。
const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4173/bomb-sorter/'
const isExternal = Boolean(process.env['PLAYWRIGHT_BASE_URL'])
const isCI = Boolean(process.env['CI'])

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : '50%',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },

  projects: [
    // iPhone のプリセットは webkit。iOS 特有の挙動はここで見る
    { name: 'iphone', use: { ...devices['iPhone 17 landscape'] } },
    { name: 'android', use: { ...devices['Pixel 9 landscape'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],

  // 外部 URL を指定したときはローカルサーバを立てない。
  // exactOptionalPropertyTypes が有効なので、undefined を代入せずキー自体を省く。
  ...(isExternal
    ? {}
    : {
        webServer: {
          // dev サーバは HMR で不安定なので、必ず preview（本番ビルド）に当てる
          command: 'npx vite preview --port 4173 --strictPort',
          url: BASE_URL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      }),
})
