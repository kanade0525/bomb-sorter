// アイコンを Playwright の Chromium で描画して PNG にする。
// 外部の画像生成ツールに頼らず、意匠（丸と角丸四角＋導火線）をコードで持つ。
// 生成物は public/icons/ に置く。作り直したいときだけ `npm run icons` を叩く。
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const OUT = resolve(import.meta.dirname, '../public/icons')

/** size = 出力サイズ, pad = 余白比率（maskable は安全域を広く取る） */
function page(size, pad) {
  const s = size
  const inner = s * (1 - pad * 2)
  const half = inner / 2
  const cx = s / 2
  const cy = s / 2
  return `<!doctype html><html><body style="margin:0">
<canvas id="c" width="${s}" height="${s}"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d')
ctx.fillStyle = '#0d0f14'
ctx.fillRect(0, 0, ${s}, ${s})

// 角丸四角（しかく側）を左下に、丸（まる側）を右上に置く
const r = ${half} * 0.52

function roundBomb(x, y, rad) {
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad)
  g.addColorStop(0, '#ff7a6b'); g.addColorStop(1, '#e4453a')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = rad * 0.09; ctx.strokeStyle = '#7a1e18'; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  const m = rad * 0.34
  ctx.beginPath(); ctx.moveTo(x, y - m); ctx.lineTo(x + m, y); ctx.lineTo(x, y + m); ctx.lineTo(x - m, y); ctx.closePath(); ctx.fill()
  fuse(x, y, rad, -Math.PI / 4)
}

function squareBomb(x, y, rad) {
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad)
  g.addColorStop(0, '#48506a'); g.addColorStop(1, '#2b3040')
  ctx.fillStyle = g
  const s2 = rad * 0.92
  ctx.beginPath(); ctx.roundRect(x - s2, y - s2, s2 * 2, s2 * 2, rad * 0.3); ctx.fill()
  ctx.lineWidth = rad * 0.1; ctx.strokeStyle = '#8a93a6'; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  const m = rad * 0.26
  ctx.beginPath(); ctx.arc(x - m, y, rad * 0.15, 0, Math.PI * 2); ctx.arc(x + m, y, rad * 0.15, 0, Math.PI * 2); ctx.fill()
  fuse(x, y, rad, -Math.PI / 2)
}

function fuse(x, y, rad, angle) {
  const bx = x + Math.cos(angle) * rad * 0.86
  const by = y + Math.sin(angle) * rad * 0.86
  const len = rad * 0.6
  const tx = bx + Math.cos(angle) * len
  const ty = by + Math.sin(angle) * len
  ctx.lineCap = 'round'; ctx.lineWidth = rad * 0.12; ctx.strokeStyle = '#c8b18a'
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke()
  ctx.fillStyle = '#ffd166'
  ctx.beginPath(); ctx.arc(tx, ty, rad * 0.15, 0, Math.PI * 2); ctx.fill()
}

squareBomb(${cx} - r * 0.72, ${cy} + r * 0.62, r)
roundBomb(${cx} + r * 0.72, ${cy} - r * 0.5, r)
</script></body></html>`
}

const TARGETS = [
  { name: 'icon-192.png', size: 192, pad: 0.08 },
  { name: 'icon-512.png', size: 512, pad: 0.08 },
  // maskable は外周 20% が切り落とされ得るので中身を小さく描く
  { name: 'maskable-512.png', size: 512, pad: 0.2 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0.08 },
]

const browser = await chromium.launch()
try {
  await mkdir(OUT, { recursive: true })
  for (const t of TARGETS) {
    const p = await browser.newPage({ viewport: { width: t.size, height: t.size } })
    await p.setContent(page(t.size, t.pad))
    const buf = await p.locator('#c').screenshot({ omitBackground: false })
    const out = resolve(OUT, t.name)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, buf)
    console.log(`${t.name}  ${t.size}x${t.size}  ${(buf.length / 1024).toFixed(1)}KB`)
    await p.close()
  }

  // favicon は SVG で持つ（ベクターなのでファイルサイズも小さい）
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0d0f14"/>
  <rect x="8" y="30" width="24" height="24" rx="6" fill="#2b3040" stroke="#8a93a6" stroke-width="2.5"/>
  <circle cx="16" cy="42" r="2.4" fill="#fff" opacity=".7"/><circle cx="24" cy="42" r="2.4" fill="#fff" opacity=".7"/>
  <circle cx="42" cy="26" r="13" fill="#e4453a" stroke="#7a1e18" stroke-width="2.5"/>
  <path d="M42 20l5 6-5 6-5-6z" fill="#fff" opacity=".6"/>
  <path d="M50 17l5-5" stroke="#c8b18a" stroke-width="3" stroke-linecap="round"/>
  <circle cx="56" cy="11" r="3" fill="#ffd166"/>
</svg>`
  await writeFile(resolve(OUT, '../favicon.svg'), svg)
  console.log('favicon.svg')
} finally {
  await browser.close()
}
