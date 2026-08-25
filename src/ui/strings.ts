/**
 * 画面に出す言葉。
 *
 * 日本語と英語だけ持つ。画面のほとんどは数字と絵で、言葉に頼っているのは
 * タイトルとゲームオーバーの周りしかない。だから 2 言語で足りる。
 *
 * 言語は場から受け取る（素のウェブなら navigator.language、
 * YouTube ゲームルームなら SDK の getLanguage）。日本語以外はすべて英語にする。
 */

export interface Strings {
  eyebrow: string
  rules: [string, string, string]
  start: string
  hintAudio: string
  hintFullscreen: string
  paused: string
  resume: string
  backToTitleLong: string
  gameOver: string
  retry: string
  backToTitle: string
  deathWrong: string
  deathFuse: string
  /** 得点のラベル */
  score: string
  /** 最高記録のラベル */
  best: string
  newRecord: string
  /** 「残り 1.2 秒」の前後 */
  remainingPrefix: string
  remainingSuffix: string
  chain: string
  countdownHint: string
  /** ボタンの読み上げ名 */
  ariaMuteOn: string
  ariaMuteOff: string
  ariaPause: string
  ariaResume: string
  ariaFullscreenOn: string
  ariaFullscreenOff: string
  ariaCanvas: string
  srGameOver: (score: number, best: number) => string
  srScore: (score: number, combo: number) => string
  bestLine: (best: number, combo: number) => string
  statsNew: (sorted: number, combo: number) => string
  stats: (sorted: number, combo: number, best: number) => string
}

const ja: Strings = {
  eyebrow: '色で仕分けるアクション',
  rules: [
    'ボムすけをドラッグして、同じ色の箱へ運ぶ',
    '違う箱に入れると爆発。導火線が尽きても爆発',
    '連続で成功すると連鎖して倍率が上がる',
  ],
  start: 'ゲーム開始',
  hintAudio: '音が出ないときは、本体のマナーモードを確認してください',
  hintFullscreen: 'ホーム画面に追加すると、画面をいっぱいに使えます',
  paused: '一時停止',
  resume: '再開',
  backToTitleLong: 'タイトルへ戻る',
  gameOver: 'ゲームオーバー',
  retry: 'もう一度',
  backToTitle: 'タイトルへ',
  deathWrong: '違う色の箱に入れた',
  deathFuse: '導火線が尽きた',
  score: '得点',
  best: '最高',
  newRecord: '新記録',
  remainingPrefix: '残り',
  remainingSuffix: '秒',
  chain: '連鎖',
  countdownHint: 'ボムすけを同じ色の箱へ',
  ariaMuteOn: '音を消す',
  ariaMuteOff: '音を出す',
  ariaPause: '一時停止',
  ariaResume: '再開する',
  ariaFullscreenOn: '全画面にする',
  ariaFullscreenOff: '全画面をやめる',
  ariaCanvas: 'ボムすけ仕分けゲームの画面',
  srGameOver: (score, best) => `ゲームオーバー。得点 ${score}、最高得点 ${best}`,
  srScore: (score, combo) => `得点 ${score}${combo > 1 ? `、${combo} 連鎖` : ''}`,
  bestLine: (best, combo) => `最高得点 ${best}（最高 ${combo} 連鎖）`,
  statsNew: (sorted, combo) => `新記録！ ボムすけ ${sorted} 体 仕分け / 最高 ${combo} 連鎖`,
  stats: (sorted, combo, best) =>
    `ボムすけ ${sorted} 体 仕分け / 最高 ${combo} 連鎖 / 最高得点 ${best}`,
}

const en: Strings = {
  eyebrow: 'Sort them by colour',
  rules: [
    'Drag each bomb into the bin of the same colour',
    'Wrong bin, or a fuse running out, and it explodes',
    'Sort them back to back to raise the chain multiplier',
  ],
  start: 'Start',
  hintAudio: 'No sound? Check the silent switch on your device.',
  hintFullscreen: 'Add to your home screen to play full screen.',
  paused: 'Paused',
  resume: 'Resume',
  backToTitleLong: 'Back to title',
  gameOver: 'Game over',
  retry: 'Play again',
  backToTitle: 'Title',
  deathWrong: 'Wrong bin',
  deathFuse: 'A fuse burned out',
  score: 'SCORE',
  best: 'BEST',
  newRecord: 'NEW BEST',
  remainingPrefix: '',
  remainingSuffix: 's left',
  chain: 'chain',
  countdownHint: 'Match the colour of the bin',
  ariaMuteOn: 'Mute',
  ariaMuteOff: 'Unmute',
  ariaPause: 'Pause',
  ariaResume: 'Resume',
  ariaFullscreenOn: 'Enter full screen',
  ariaFullscreenOff: 'Leave full screen',
  ariaCanvas: 'Bomb sorting game',
  srGameOver: (score, best) => `Game over. Score ${score}, best ${best}.`,
  srScore: (score, combo) => `Score ${score}${combo > 1 ? `, ${combo} chain` : ''}`,
  bestLine: (best, combo) => `Best ${best} (longest chain ${combo})`,
  statsNew: (sorted, combo) => `New best! ${sorted} sorted / longest chain ${combo}`,
  stats: (sorted, combo, best) => `${sorted} sorted / longest chain ${combo} / best ${best}`,
}

/** BCP-47 のタグから、持っている言語を選ぶ。日本語以外はすべて英語 */
export function pickStrings(language: string): Strings {
  return /^ja\b/i.test(language) ? ja : en
}

/** 選ばれている言語。main が起動時に決める */
let current: Strings = ja

export function setLanguage(language: string): Strings {
  current = pickStrings(language)
  return current
}

export function t(): Strings {
  return current
}
