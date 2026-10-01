// itch.io へ上げる単体配布のビルドを、機械で見られる範囲で確かめる。
//
// itch.io は zip の中身をそのまま配信し、ゲームは別ドメインの iframe の中で動く。
// つまり「どのパスに置かれるか」も「親ページが何か」もこちらでは決められない。
// ここで見ているのは、その前提を壊していないかの一点。
//
// 置き場所の仕様の出典:
//   https://itch.io/docs/creators/html5
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'dist-itch')
const problems = []

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
  console.error(`${relative(ROOT, OUT)} がありません。先に npm run build:itch を実行してください`)
  process.exit(1)
}

const KIB = 1024
const names = files.map((f) => relative(OUT, f))

// ---- 1) index.html が zip の直下にあること ----
// itch.io は zip の一番上の index.html を入口にする。
// 1 階層深いところに入れると「ゲームが見つからない」と言われる
if (!names.includes('index.html')) ng('index.html が直下にない（itch.io はここを入口にする）')

const html = await readFile(join(OUT, 'index.html'), 'utf8')

// ---- 2) 絶対パスを残さない ----
// 配信先は https://<ランダム>.ssl.hwcdn.net/html/<番号>/ のような「深い」場所。
// '/assets/...' と書くとドメインの直下を見にいって 404 になる
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = m[1]
  if (url.startsWith('http://') || url.startsWith('https://')) continue
  if (url.startsWith('/')) ng(`絶対パスが残っている: ${url}`)
}

// ---- 3) 参照しているのに同梱されていないファイルが無いか ----
// publicDir を外しているので、アイコンの参照が残ると 404 になる
for (const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  const rel = m[1].replace(/^\.\//, '')
  if (!names.includes(rel)) ng(`参照しているファイルが無い: ${m[1]}`)
}

// ---- 4) Service Worker を含めない ----
// iframe の中の、しかも共有ドメインの配下で動く。登録してもスコープが噛み合わず、
// 他の人のゲームと同じドメインにキャッシュを残すことになる
if (names.some((f) => /sw\.js$|workbox|webmanifest$/.test(f))) {
  ng('Service Worker か manifest が混ざっている。itch.io では要らない')
}

// ---- 5) ゲームルーム向けの作りが混ざっていないか ----
// ビルドの取り違え（dist-playables を上げてしまう類）を機械で止める。
// SDK は YouTube の中にしか無いので、itch.io では読み込みに失敗するだけ
if (html.includes('youtube.com/game_api')) {
  ng('YouTube ゲームルームの SDK が混ざっている。ITCH=1 でビルドし直すこと')
}

// ---- 6) リンクのプレビュー用のタグを残さない ----
// 公開先のドメインを絶対 URL で書いてあるので、配信元が違うここでは意味が無い
for (const m of html.matchAll(/<meta\b[^>]*(?:og:|twitter:)[^>]*>/g)) {
  ng(`リンクのプレビュー用のタグが残っている: ${m[0].replace(/\s+/g, ' ').slice(0, 60)}`)
}

// ---- 7) 外へ通信が出ていかないこと ----
// 素のウェブと同じ不変条件を保つ。itch.io 側に広告や計測を足されても、
// こちらから外へ出ていく道は無い
if (!html.includes("connect-src 'none'")) {
  ng("CSP の connect-src 'none' が無い（外部通信を塞ぐ宣言が落ちている）")
}

let total = 0
for (const f of files) total += (await stat(f)).size

console.log('itch.io 向けビルドの検査')
console.log(`  ファイル数        ${files.length}`)
console.log(`  総計              ${(total / KIB).toFixed(1)} KiB`)

if (problems.length > 0) {
  console.error('\n上げる前に直すところがあります:\n')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('  → 機械で見られる範囲では問題ありません')
