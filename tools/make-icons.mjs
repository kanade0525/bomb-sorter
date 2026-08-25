// アイコンを Playwright の Chromium で描画して PNG にする。
// 意匠（ピクセルアートのボムすけ）をコードで持ち、外部の画像生成には頼らない。
// 生成物は public/icons/。作り直したいときだけ `npm run icons` を叩く。
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const OUT = resolve(import.meta.dirname, '../public/icons')

/**
 * 本体のドット。src/view/draw-bomb.ts と同じ考え方で、
 * 半径 6 ドットの円を 1 ドットずつ塗る。
 */
function page(size, pad) {
  const s = size
  return `<!doctype html><html><body style="margin:0">
<canvas id="c" width="${s}" height="${s}"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d')
const S = ${s}, PAD = ${pad}
ctx.fillStyle = '#12141a'
ctx.fillRect(0, 0, S, S)

const R = 6, LEG_H = 4
// 2 体を斜めに並べる。1 体ぶんの高さは 本体(13) + 足(4) + 導火線(5) ドット
const p = Math.floor((S * (1 - PAD * 2)) / 26)

function bodyShade(dx, dy) {
  const d2 = dx * dx + dy * dy, r2 = R * R
  if (d2 > r2) return null
  const out = (ax, ay) => ax * ax + ay * ay > r2
  if (out(dx + 1, dy) || out(dx - 1, dy) || out(dx, dy + 1) || out(dx, dy - 1)) return 'edge'
  if (dx <= -1 && dy <= -2 && dx >= -3) return 'light'
  if (dx + dy > 4) return 'shade'
  return 'body'
}

function bomb(cx, cy, st) {
  const dot = (x, y, w = 1, h = 1) => ctx.fillRect(cx + x * p, cy + y * p, w * p, h * p)
  // 足
  for (const lx of [-3, 1]) {
    ctx.fillStyle = '#3d4354'; dot(lx, R - 1, 2, LEG_H)
    ctx.fillStyle = '#5f687e'; dot(lx, R - 1 + LEG_H - 1, 3, 1)
  }
  // 本体
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const k = bodyShade(dx, dy)
      if (!k) continue
      ctx.fillStyle = k === 'edge' ? st.edge : k === 'light' ? st.light : k === 'shade' ? st.shade : st.body
      dot(dx, dy)
    }
  }
  // 目
  ctx.fillStyle = '#f4f6fa'; dot(-3, -2, 2, 2); dot(1, -2, 2, 2)
  ctx.fillStyle = '#14161c'; dot(-2, -1); dot(2, -1)
  // 導火線と火花
  ctx.fillStyle = '#c8b18a'
  for (let i = 0; i < 4; i++) dot(1 + i, -R - 1 - i)
  ctx.fillStyle = '#ffd166'; dot(5, -R - 5, 2, 2)
}

const RED = { body: '#e4453a', light: '#ff8a7a', shade: '#a02a22', edge: '#6d1a14' }
const BLACK = { body: '#2a2e3a', light: '#565d72', shade: '#171a22', edge: '#78829a' }

bomb(S * 0.36, S * 0.60, BLACK)
bomb(S * 0.64, S * 0.44, RED)
</script></body></html>`
}

/** OG カードの中身。鉄板の床・トラロープ・ボムすけ 2 体・タイトル */
function ogPage(W, H) {
  return `<!doctype html><html><body style="margin:0">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d')
const W = ${W}, H = ${H}
const p = 10             // ドット 1 個の大きさ
const R = 6, LEG_H = 4

// 鉄板の床
ctx.fillStyle = '#1a1d26'
ctx.fillRect(0, 0, W, H)
const PLATE = 112
for (let y = 0; y < H; y += PLATE) {
  for (let x = 0; x < W; x += PLATE) {
    const alt = ((x / PLATE) | 0) % 2 === ((y / PLATE) | 0) % 2
    ctx.fillStyle = alt ? '#1e222c' : '#1a1d26'
    ctx.fillRect(x, y, PLATE, PLATE)
    ctx.fillStyle = '#2b3040'; ctx.fillRect(x, y, PLATE, 2); ctx.fillRect(x, y, 2, PLATE)
    ctx.fillStyle = '#12141b'
    ctx.fillRect(x, y + PLATE - 2, PLATE, 2); ctx.fillRect(x + PLATE - 2, y, 2, PLATE)
    ctx.fillStyle = '#39405240'
    for (const [rx, ry] of [[10,10],[PLATE-14,10],[10,PLATE-14],[PLATE-14,PLATE-14]]) {
      ctx.fillRect(x + rx, y + ry, 4, 4)
    }
  }
}

// 上下のトラロープ
function hazard(y, h) {
  const d = 8, band = 24, period = band * 2
  ctx.fillStyle = '#181a20'; ctx.fillRect(0, y, W, h)
  ctx.fillStyle = '#e8b427'
  for (let ry = 0; ry < h; ry += d) {
    for (let rx = 0; rx < W; rx += d) {
      if ((((rx + ry) % period) + period) % period < band) ctx.fillRect(rx, y + ry, d, d)
    }
  }
}
hazard(0, 24)
hazard(H - 24, 24)

function bodyShade(dx, dy) {
  const d2 = dx*dx + dy*dy, r2 = R*R
  if (d2 > r2) return null
  const out = (ax, ay) => ax*ax + ay*ay > r2
  if (out(dx+1,dy) || out(dx-1,dy) || out(dx,dy+1) || out(dx,dy-1)) return 'edge'
  if (dx <= -1 && dy <= -2 && dx >= -3) return 'light'
  if (dx + dy > 4) return 'shade'
  return 'body'
}

function bomb(cx, cy, st, legPhase) {
  const dot = (x, y, w = 1, h = 1) => ctx.fillRect(cx + x*p, cy + y*p, w*p, h*p)
  for (const [lx, off] of [[-3, legPhase], [1, -legPhase]]) {
    ctx.fillStyle = '#3d4354'; dot(lx, R - 1 + off, 2, LEG_H)
    ctx.fillStyle = '#5f687e'; dot(lx, R - 1 + off + LEG_H - 1, 3, 1)
  }
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const k = bodyShade(dx, dy); if (!k) continue
    ctx.fillStyle = k === 'edge' ? st.edge : k === 'light' ? st.light : k === 'shade' ? st.shade : st.body
    dot(dx, dy)
  }
  ctx.fillStyle = '#f4f6fa'; dot(-3,-2,2,2); dot(1,-2,2,2)
  ctx.fillStyle = '#14161c'; dot(-2,-1); dot(2,-1)
  ctx.fillStyle = '#c8b18a'
  for (let i = 0; i < 4; i++) dot(1+i, -R-1-i)
  ctx.fillStyle = '#ffd166'; dot(5, -R-5, 2, 2)
}

const RED = { body: '#e4453a', light: '#ff8a7a', shade: '#a02a22', edge: '#6d1a14' }
const BLACK = { body: '#2a2e3a', light: '#565d72', shade: '#171a22', edge: '#78829a' }

// 左に赤、右に黒。ゲーム中の並びと同じにする。
// 文字と重ならないよう、左右の端に寄せる
bomb(W * 0.11, H * 0.50, RED, 1)
bomb(W * 0.89, H * 0.50, BLACK, -1)

// タイトル
ctx.textAlign = 'center'
ctx.fillStyle = '#e8ecf4'
ctx.font = '700 96px system-ui, -apple-system, sans-serif'
ctx.fillText('Bomb Sorter', W / 2, H * 0.44)
ctx.fillStyle = '#98a1b5'
ctx.font = '600 30px system-ui, -apple-system, sans-serif'
ctx.fillText('Sort them by colour before the fuses burn out', W / 2, H * 0.56)
ctx.fillStyle = '#ffd166'
ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace'
ctx.fillText('kanade0525.github.io/bomb-sorter', W / 2, H * 0.68)
</script></body></html>`
}

const TARGETS = [
  { name: 'icon-192.png', size: 192, pad: 0.06 },
  { name: 'icon-512.png', size: 512, pad: 0.06 },
  // maskable は外周 20% が切り落とされ得るので中身を小さく描く
  { name: 'maskable-512.png', size: 512, pad: 0.18 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0.06 },
]

const browser = await chromium.launch()
try {
  await mkdir(OUT, { recursive: true })
  for (const t of TARGETS) {
    const pg = await browser.newPage({ viewport: { width: t.size, height: t.size } })
    await pg.setContent(page(t.size, t.pad))
    const buf = await pg.locator('#c').screenshot()
    await writeFile(resolve(OUT, t.name), buf)
    console.log(`${t.name}  ${t.size}x${t.size}  ${(buf.length / 1024).toFixed(1)}KB`)
    await pg.close()
  }

  // ---- OG カード（リンクを貼ったときのプレビュー画像） ----
  // 応募や共有でこの URL を貼ることがある。プレビューが出ないと何のリンクか分からない。
  // 中身はゲームと同じ描き方（ドットを 1 個ずつ）で作るので、外部の画像素材は増えない
  {
    const W = 1200
    const H = 630
    const pg = await browser.newPage({ viewport: { width: W, height: H } })
    await pg.setContent(ogPage(W, H))
    const buf = await pg.locator('#c').screenshot()
    await writeFile(resolve(OUT, '../og.png'), buf)
    console.log(`og.png  ${W}x${H}  ${(buf.length / 1024).toFixed(1)}KB`)
    await pg.close()
  }

  // favicon はベクターで持つ。ドットの矩形をそのまま並べる
  const rects = []
  const R = 6
  const px = (x, y, w, h, fill) =>
    rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`)
  const st = { body: '#e4453a', light: '#ff8a7a', shade: '#a02a22', edge: '#6d1a14' }
  const cx = 8,
    cy = 9
  for (const lx of [-3, 1]) {
    px(cx + lx, cy + R - 1, 2, 4, '#3d4354')
    px(cx + lx, cy + R + 2, 3, 1, '#5f687e')
  }
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy
      if (d2 > R * R) continue
      const out = (ax, ay) => ax * ax + ay * ay > R * R
      const edge = out(dx + 1, dy) || out(dx - 1, dy) || out(dx, dy + 1) || out(dx, dy - 1)
      const light = dx <= -1 && dy <= -2 && dx >= -3
      const shade = dx + dy > 4
      px(cx + dx, cy + dy, 1, 1, edge ? st.edge : light ? st.light : shade ? st.shade : st.body)
    }
  }
  px(cx - 3, cy - 2, 2, 2, '#f4f6fa')
  px(cx + 1, cy - 2, 2, 2, '#f4f6fa')
  px(cx - 2, cy - 1, 1, 1, '#14161c')
  px(cx + 2, cy - 1, 1, 1, '#14161c')
  for (let i = 0; i < 3; i++) px(cx + 1 + i, cy - R - 1 - i, 1, 1, '#c8b18a')
  px(cx + 4, cy - R - 3, 2, 2, '#ffd166')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" shape-rendering="crispEdges">
  <rect width="20" height="20" fill="#12141a"/>
  ${rects.join('\n  ')}
</svg>`
  await writeFile(resolve(OUT, '../favicon.svg'), svg)
  console.log('favicon.svg')
} finally {
  await browser.close()
}
