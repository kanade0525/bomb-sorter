/**
 * ゲーム全体で使う型。
 *
 * ボムの見た目は 2 種類とも完全に同じピクセルアートで、違うのは色だけ。
 * 形での冗長化をやめた代わりに、赤（明るい）と黒（暗い）という明度差の大きい
 * 組み合わせを選んである。色の区別がつかなくても、明るいか暗いかで判別できる。
 */
export type BombKind = 'red' | 'black'

export type Phase = 'title' | 'ready' | 'playing' | 'paused' | 'exploding' | 'gameover'

/** 死因。爆発演出の文言と読み上げに使う */
export type DeathReason = 'wrong' | 'fuse'

export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Bomb {
  id: number
  kind: BombKind
  x: number
  y: number
  /** 歩く向き（ラジアン） */
  dir: number
  /** 現在の歩行速度 */
  speed: number
  /** 次に向きを変えるまでの残り秒 */
  turnTimer: number
  /** 導火線の残り秒 */
  fuse: number
  /** この個体の導火線の初期長さ。残量比の分母 */
  fuseMax: number
  /** 掴んでいるポインタの id。掴まれていなければ null */
  grabbedBy: number | null
  /** 足の運びの位相。よちよち歩きの見た目に使う */
  step: number
  /** 向いている左右。-1 が左、1 が右 */
  facing: -1 | 1
  /** 掴んだ瞬間の指と中心のズレ。ドラッグ中に中心が指へ飛ばないようにする */
  holdDx: number
  holdDy: number
  /** 正解の箱へ入れた直後の吸い込み演出の進み（0..1）。1 で消える */
  vanish: number
}

/**
 * 箱の中に溜まったボム。
 * 位置は箱の矩形に対する 0..1 の割合で持つので、画面の大きさが変わっても壊れない。
 */
export interface StoredBomb {
  kind: BombKind
  u: number
  v: number
  du: number
  dv: number
  step: number
  facing: -1 | 1
}

export interface Zone {
  kind: BombKind
  rect: Rect
  /** 溜まったボムが歩き回る内側の領域 */
  inner: Rect
}

export interface Layout {
  logicalW: number
  logicalH: number
  hud: Rect
  /** ボムが歩き回る領域 */
  field: Rect
  zones: Zone[]
}

/** 描画と音への「起きたこと」の通知。純粋レイヤは副作用を持たずこれを積むだけ */
export type Effect =
  | { t: 'grab' }
  | { t: 'ok'; x: number; y: number; kind: BombKind; gain: number; combo: number }
  | { t: 'miss'; x: number; y: number; kind: BombKind; reason: DeathReason }
  | { t: 'combo-lost' }
  | { t: 'warn'; level: 1 | 2 }
  | { t: 'spawn'; x: number; y: number }

export type InputAction =
  | { t: 'grab'; pointerId: number; x: number; y: number }
  | { t: 'move'; pointerId: number; x: number; y: number }
  | { t: 'release'; pointerId: number; x: number; y: number }
  | { t: 'cancel'; pointerId: number }

/** ゲームの外から与える指示。フェーズ遷移のきっかけ */
export type Command = 'start' | 'pause' | 'resume' | 'restart' | 'title'

/** mulberry32 の内部状態。値として持ち回ることでテストを決定的にする */
export interface RngState {
  s: number
}

export interface World {
  phase: Phase
  /** playing 中だけ進む経過秒。難易度カーブの入力 */
  time: number
  /** 現フェーズに入ってからの経過秒 */
  phaseTime: number
  score: number
  /** 連続成功数。次の成功時の倍率は comboMultiplier(combo) */
  combo: number
  /** コンボ窓の残り秒。0 になるとコンボが切れる */
  comboTimer: number
  bestCombo: number
  bombs: Bomb[]
  /** 箱ごとに溜まったボム。仕分けた結果が目に見えて残る */
  stored: Record<BombKind, StoredBomb[]>
  nextId: number
  spawnTimer: number
  rng: RngState
  effects: Effect[]
  deathReason: DeathReason | null
  /** 同じ色が続きすぎないようにするための直近の履歴 */
  lastKind: BombKind | null
  sameKindRun: number
  /** 直近フレームの最大警告レベル。音の発火判定に使う */
  warnLevel: 0 | 1 | 2
  /** 仕分け成功の総数。統計表示用 */
  sorted: number
}
