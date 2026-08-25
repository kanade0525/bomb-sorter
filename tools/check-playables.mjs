// YouTube ゲームルーム（Playables）向けビルドが、公開されている認定要件を
// 満たしているかを機械で見る。応募のたびに目で確かめるのは続かない。
//
// 要件の出典:
//   https://developers.google.com/youtube/gaming/playables/certification/requirements_stability
//   https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'dist-playables')
const problems = []
const notes = []

function ng(message) {
  problems.push(message)
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

let files
try {
  files = await walk(OUT)
} catch {
  console.error(
    `${relative(ROOT, OUT)} がありません。先に npm run build:playables を実行してください`
  )
  process.exit(1)
}

const MIB = 1024 * 1024
const KIB = 1024

// ---- 1) 容量（MUST: 初期 30 MiB 未満・総計 250 MiB 未満・個別 30 MiB 未満） ----
let total = 0
let largest = { path: '', size: 0 }
for (const f of files) {
  const { size } = await stat(f)
  total += size
  if (size > largest.size) largest = { path: relative(OUT, f), size }
  if (size >= 30 * MIB) ng(`個別ファイルが 30 MiB 以上: ${relative(OUT, f)}`)
  if (size >= 512 * KIB) {
    notes.push(`512 KiB を超えるファイル（SHOULD 違反、必須ではない）: ${relative(OUT, f)}`)
  }
}
if (total >= 250 * MIB) ng(`総計が 250 MiB 以上: ${(total / MIB).toFixed(1)} MiB`)
if (files.length > 8000) ng(`ファイル数が 8000 を超えている: ${files.length}`)

// ---- 2) ファイル名（英数字と _ - . のみ） ----
for (const f of files) {
  const name = f.split('/').pop() ?? ''
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) ng(`使えない文字を含むファイル名: ${name}`)
}

const html = await readFile(join(OUT, 'index.html'), 'utf8')

// ---- 3) 絶対パスの禁止（MUST） ----
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = m[1]
  if (url.startsWith('http://') || url.startsWith('https://')) continue // SDK は別
  if (url.startsWith('/')) ng(`絶対パスが残っている: ${url}`)
}

// ---- 4) SDK がゲームコードより前に読み込まれること ----
const sdkAt = html.indexOf('https://www.youtube.com/game_api/v1')
const moduleAt = html.search(/<script[^>]*type="module"/)
if (sdkAt < 0) ng('SDK の script タグが無い')
else if (moduleAt >= 0 && sdkAt > moduleAt) {
  ng('SDK がゲームコードより後に読み込まれている（ytgame が未定義のまま起動する）')
}

// ---- 5) Service Worker を含めない（配信も更新も向こうが持っている） ----
if (files.some((f) => /sw\.js$|workbox/.test(f))) {
  ng('Service Worker が混ざっている。ゲームルームでは要らない')
}

// ---- 6) 配信元が違うのに絶対 URL で参照するタグを残していないか ----
// リンクのプレビュー用のタグは公開先のドメインを直接書いているので、
// ゲームルームでは意味がなく、絶対パス禁止の要件にも触れる
for (const m of html.matchAll(/<meta\b[^>]*(?:og:|twitter:)[^>]*>/g)) {
  ng(`リンクのプレビュー用のタグが残っている: ${m[0].replace(/\s+/g, ' ').slice(0, 60)}`)
}

// ---- 7) 参照しているのに配信されないファイルが無いか ----
// publicDir を外しているので、アイコンの参照が残ると 404 になる
for (const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  const rel = m[1].replace(/^\.\//, '')
  if (!files.some((f) => relative(OUT, f) === rel)) {
    ng(`参照しているファイルが無い: ${m[1]}`)
  }
}

// ---- 8) 外部サイトへのリンクを置かない（MUST NOT） ----
for (const m of html.matchAll(/<a\b[^>]*href="(https?:[^"]+)"/g)) {
  ng(`外部サイトへのリンクがある: ${m[1]}`)
}

// ---- 9) SDK の必須呼び出しが入っていること ----
const js = (
  await Promise.all(files.filter((f) => f.endsWith('.js')).map((f) => readFile(f, 'utf8')))
).join('\n')
for (const call of ['firstFrameReady', 'gameReady']) {
  if (!js.includes(call)) ng(`SDK の必須呼び出しが見当たらない: ${call}`)
}

console.log(`Playables ビルドの検査`)
console.log(`  ファイル数        ${files.length}`)
console.log(`  総計              ${(total / KIB).toFixed(1)} KiB`)
console.log(`  最大のファイル    ${largest.path} (${(largest.size / KIB).toFixed(1)} KiB)`)
for (const n of notes) console.log(`  補足: ${n}`)

if (problems.length > 0) {
  console.error('\n認定要件に反しています:\n')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('  → 機械で見られる範囲では要件を満たしています')
