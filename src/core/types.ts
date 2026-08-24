/**
 * ゲーム全体で使う型。
 *
 * ボムの種類を 'red' | 'black' ではなく 'round' | 'square' と形で名付けているのは意図的。
 * 色は palette.ts の写像にすぎない、という関係にしておくと
 * 「色だけで区別する UI」がコード上そもそも作りにくくなる（色覚多様性への配慮）。
 */
export type BombKind = 'round' | 'square'

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
  vx: number
  vy: number
  /** 導火線の残り秒 */
  fuse: number
  /** この個体の導火線の初期長さ。残量比の分母 */
  fuseMax: number
  /** 掴んでいるポインタの id。掴まれていなければ null */
  grabbedBy: number | null
  /** 見た目の揺れ用の位相。描画専用でロジックには影響しない */
  wobble: number
  /** 掴んだ瞬間の指と中心のズレ。ドラッグ中に中心が指へ飛ばないようにする */
  holdDx: number
  holdDy: number
  /** 正解ゾーンへ入れた直後の吸い込み演出の進み（0..1）。1 で消える */
  vanish: number
}

export interface Zone {
  kind: BombKind
  rect: Rect
  iconCenter: Vec2
}

export interface Layout {
  logicalW: number
  logicalH: number
  hud: Rect
  /** ボムが漂える領域 */
  field: Rect
  zones: Zone[]
}

/** 描画と音への「起きたこと」の通知。純粋レイヤは副作用を持たずこれを積むだけ */
export type Effect =
  | { t: 'grab' }
  | { t: 'ok'; x: number; y: number; kind: BombKind; gain: number; combo: number }
  | { t: 'miss'; x: number; y: number; reason: DeathReason }
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
  nextId: number
  spawnTimer: number
  rng: RngState
  effects: Effect[]
  deathReason: DeathReason | null
  /** 同じ形が続きすぎないようにするための直近の履歴 */
  lastKind: BombKind | null
  sameKindRun: number
  /** 直近フレームの最大警告レベル。音の発火判定に使う */
  warnLevel: 0 | 1 | 2
  /** 仕分け成功の総数。統計表示用 */
  sorted: number
}
