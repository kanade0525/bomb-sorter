// 手元でも CI でも同じものが走る自作の検査。
// lint の代わりではなく、「このプロジェクトで守りたい不変条件」を機械で見張るためのもの。
// 新しい種類の不具合を見つけたら、直すだけでなくここに検査を足す。
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const problems = []

function ng(file, message) {
  problems.push(`${relative(ROOT, file)}: ${message}`)
}

/**
 * コメントと文字列リテラルを落としてから中身を見る。
 * これをやらないと「window は触らない」と書いたコメント自体が検査に引っかかる。
 */
function stripCommentsAndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, "''")
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

/** コメント・文字列を落とした本文を返す */
async function codeOf(file) {
  return stripCommentsAndStrings(await readFile(file, 'utf8'))
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'dev-dist', 'coverage', '.git'].includes(e.name)) continue
      await walk(p, out)
    } else {
      out.push(p)
    }
  }
  return out
}

const files = await walk(ROOT)
const ts = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
const src = ts.filter((f) => f.includes(`${'/'}src${'/'}`))

// ---- 1) 純粋レイヤに副作用が漏れていないか ----
// core/ と game/ は window も Date も Math.random も触らない。ここが守れている限り
// ゲームのルール全体が Vitest だけで検証できる。
const PURE_DIRS = ['/src/core/', '/src/game/']
const FORBIDDEN = [
  [/\bwindow\b/, 'window を参照している'],
  [/\bdocument\b/, 'document を参照している'],
  [/\bnavigator\b/, 'navigator を参照している'],
  [/\blocalStorage\b/, 'localStorage を参照している'],
  [/\bperformance\b/, 'performance を参照している'],
  [/Math\.random/, 'Math.random を呼んでいる（rng を引数で受けること）'],
  [/\bDate\.now\b/, 'Date.now を呼んでいる'],
  [/new Date\(/, 'new Date を呼んでいる'],
]
for (const f of src) {
  if (!PURE_DIRS.some((d) => f.includes(d))) continue
  if (f.endsWith('.test.ts')) continue
  const text = await codeOf(f)
  for (const [re, msg] of FORBIDDEN) {
    if (re.test(text)) ng(f, `純粋レイヤなのに ${msg}`)
  }
}

// ---- 2) innerHTML / outerHTML / document.write を使っていないか ----
for (const f of src) {
  const text = await codeOf(f)
  for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    if (text.includes(bad)) ng(f, `${bad} は使わない（要素を組み立てること）`)
  }
}

// ---- 3) 外部 URL からの import が無いか ----
for (const f of ts) {
  const text = await readFile(f, 'utf8')
  const m = text.match(/from\s+['"]https?:\/\/[^'"]+['"]/)
  if (m) ng(f, `外部 URL から import している: ${m[0]}`)
}

// ---- 4) localStorage のキーが規約どおりか ----
// bomb-sorter:<なにか>:v<数字> の形に揃えて、将来のスキーマ変更に備える
{
  const consts = await readFile(join(ROOT, 'src/core/constants.ts'), 'utf8')
  const keys = [...consts.matchAll(/STORAGE_KEY\s*=\s*'([^']+)'/g)].map((m) => m[1])
  if (keys.length === 0) ng(join(ROOT, 'src/core/constants.ts'), 'STORAGE_KEY が見つからない')
  for (const k of keys) {
    if (!/^bomb-sorter:[a-z-]+:v\d+$/.test(k)) {
      ng(join(ROOT, 'src/core/constants.ts'), `localStorage のキーが規約外: ${k}`)
    }
  }
  // localStorage を直接触るのは storage.ts だけに閉じる
  for (const f of src) {
    if (f.endsWith('/platform/storage.ts')) continue
    const text = await codeOf(f)
    if (/\blocalStorage\b/.test(text)) ng(f, 'localStorage は platform/storage.ts 経由で使う')
  }
}

// ---- 5) 数値パラメータが constants.ts に集約されているか ----
// game/ 配下に生の秒数・座標が散ると調整不能になるので、import を必須にする
for (const f of src) {
  if (!f.includes('/src/game/')) continue
  if (f.endsWith('.test.ts') || f.endsWith('/phase.ts')) continue
  const text = await readFile(f, 'utf8')
  if (!text.includes("from '../core/constants'")) {
    ng(f, 'core/constants を import していない（数値を直書きしていないか確認）')
  }
}

// ---- 6) base 設定と参照パスの整合 ----
{
  const cfg = await readFile(join(ROOT, 'vite.config.ts'), 'utf8')
  const m = cfg.match(/const BASE = '([^']+)'/)
  if (!m) ng(join(ROOT, 'vite.config.ts'), 'BASE が読み取れない')
  else {
    const base = m[1]
    if (!base.startsWith('/') || !base.endsWith('/')) {
      ng(join(ROOT, 'vite.config.ts'), `BASE は前後をスラッシュで挟む: ${base}`)
    }
    const html = await readFile(join(ROOT, 'index.html'), 'utf8')
    for (const ref of [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)]) {
      const url = ref[1]
      // /src/main.ts は Vite が解決するので対象外
      if (url.startsWith('/src/')) continue
      if (!url.startsWith(base)) {
        ng(join(ROOT, 'index.html'), `絶対パスが base から始まっていない: ${url}`)
      }
    }
  }
}

// ---- 7) 音源・フォントなどのバイナリ素材を抱えていないか ----
// 音は WebAudio で合成し、文字は system-ui を使う。外部素材を持たないことを不変条件にする
for (const f of files) {
  if (!f.includes('/public/') && !f.includes('/src/')) continue
  if (/\.(mp3|ogg|wav|m4a|woff2?|ttf|otf|jpg|jpeg|gif|mp4|webm)$/i.test(f)) {
    ng(f, '音源・フォント・写真は持たない方針（合成と手続き的描画で作る）')
  }
}

// ---- 8) ワークフローが実在するメジャーバージョンを指しているか ----
{
  const EXPECT = {
    'actions/checkout': 'v7',
    'actions/setup-node': 'v7',
    'actions/configure-pages': 'v6',
    'actions/upload-pages-artifact': 'v5',
    'actions/deploy-pages': 'v5',
    'actions/cache': 'v6',
    'actions/upload-artifact': 'v7',
    'actions/download-artifact': 'v8',
  }
  const wf = files.filter((f) => f.includes('/.github/workflows/'))
  for (const f of wf) {
    const text = await readFile(f, 'utf8')
    for (const [name, want] of Object.entries(EXPECT)) {
      const re = new RegExp(`uses:\\s*${name.replace('/', '\\/')}@(v\\d+)`, 'g')
      for (const m of text.matchAll(re)) {
        if (m[1] !== want) ng(f, `${name} は ${want} を使う（見つかったのは ${m[1]}）`)
      }
    }
  }
}

// ---- 9) デバッグ用の書き捨てファイルが残っていないか ----
// 一度 tests/e2e/__dbg.spec.ts をコミット直前まで持ち込んでしまったので、機械で止める
for (const f of files) {
  const name = f.split('/').pop() ?? ''
  if (name.startsWith('__') || /\b(dbg|debug|tmp|scratch|wip)\.(ts|mjs|js)$/.test(name)) {
    ng(f, '書き捨てのファイルが残っている（消すか、ちゃんとした名前を付ける）')
  }
}

if (problems.length > 0) {
  console.error('検査で問題が見つかりました:\n')
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`\n計 ${problems.length} 件`)
  process.exit(1)
}
console.log(`検査 OK（${ts.length} ファイルを見ました）`)
