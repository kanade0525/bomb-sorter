import { expect, test } from '@playwright/test'
import { ready } from '../helpers/game'

test('manifest がサブパス込みで正しく解決される', async ({ page, baseURL }) => {
  await page.goto('./')
  const href = await page.getAttribute('link[rel="manifest"]', 'href')
  expect(href).toContain('/bomb-sorter/')

  const url = new URL(href!, baseURL).toString()
  const res = await page.request.get(url)
  expect(res.ok()).toBe(true)

  const m = await res.json()
  expect(m.start_url).toBe('/bomb-sorter/')
  expect(m.scope).toBe('/bomb-sorter/')
  expect(m.display).toBe('fullscreen')
  expect(m.display_override).toEqual(['fullscreen', 'standalone'])
  // 縦持ちでも横持ちでも遊べるので、向きは固定しない
  expect(m.orientation).toBe('any')
  expect(m.icons.length).toBeGreaterThanOrEqual(2)
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)

  // アイコンが実際に取れるか。base 忘れが一番出やすい所
  for (const icon of m.icons) {
    const r = await page.request.get(new URL(icon.src, url).toString())
    expect(r.ok(), `アイコンが取得できない: ${icon.src}`).toBe(true)
  }
})

test('apple-touch-icon が存在して取得できる', async ({ page, baseURL }) => {
  await page.goto('./')
  const href = await page.getAttribute('link[rel="apple-touch-icon"]', 'href')
  expect(href).toContain('/bomb-sorter/')
  const r = await page.request.get(new URL(href!, baseURL).toString())
  expect(r.ok()).toBe(true)
})

test('Service Worker がサブパスのスコープで登録される', async ({ page }) => {
  await page.goto('./')
  await ready(page)

  const supported = await page.evaluate(() => 'serviceWorker' in navigator)
  test.skip(!supported, 'この環境では Service Worker が使えない')

  const scope = await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) return reg.scope
      await new Promise((r) => setTimeout(r, 100))
    }
    return null
  })
  expect(scope).toContain('/bomb-sorter/')
})

test('CSP が本番ビルドに入っていて、外部通信を許していない', async ({ page }) => {
  await page.goto('./')
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content')
  expect(csp).toContain("connect-src 'none'")
  expect(csp).toContain("default-src 'none'")
  expect(csp).toContain("script-src 'self'")
})
