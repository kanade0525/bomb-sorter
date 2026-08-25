/**
 * 数値パラメータの唯一の置き場。
 * 調整はすべてここで行う。他のファイルに数値リテラルを散らさない。
 */

export const TIMING = {
  FIXED_DT: 1 / 60,
  /** 1 フレームで進める上限。タブ復帰時の巨大 delta を切り捨てる */
  MAX_FRAME_DELTA: 0.1,
  /** 1 フレームで回すシミュレーション回数の上限。追いつけない時は借金を捨てる */
  MAX_STEPS: 5,
  /** ポーズ解除・復帰後のカウントダウン。この間は導火線が減らない */
  READY_SEC: 1.5,
  /** 爆発演出の長さ */
  EXPLODE_SEC: 0.9,
} as const

export const FIELD = {
  /**
   * 横持ち専用。短い方の辺（高さ）を固定して、当たり判定とボムの大きさを
   * 全端末で同一にする。幅だけ端末の比率に応じて伸縮させ、差は
   * 中央のフィールドの横幅として吸収する。
   */
  LOGICAL_H: 360,
  W_MIN: 560,
  W_MAX: 900,
  /** 大画面で拡大しすぎるとスマホ向けの操作感から離れるので上限を置く */
  MAX_SCALE: 1.6,
  HUD_H: 40,
  /** 左右の箱の幅 */
  ZONE_W: 136,
  /** 箱とフィールドの隙間 */
  ZONE_GAP: 12,
  EDGE_PAD: 10,
  /**
   * HUD の中央で、DOM のボタン（音・一時停止）のために空けておく論理幅。
   * ボタンは Canvas の外にある DOM なので、Canvas 側の描画がここへ入り込むと重なる。
   */
  HUD_RESERVED_RIGHT: 108,
} as const

export const BOMB = {
  RADIUS: 24,
  /** 当たり判定の上乗せ。指のズレに優しくする */
  HIT_BONUS: 9,
  /** ピクセルアートの 1 ドットの大きさ（論理px） */
  PIXEL: 4,
  /** よちよち歩きの基準速度（論理px/秒） */
  WALK_BASE: 26,
  WALK_MAX_SCALE: 2.4,
  /** 向きを変えるまでの間隔 */
  TURN_MIN_SEC: 0.7,
  TURN_MAX_SEC: 2.2,
  /** 足の運びの速さ。歩く速さに比例させる */
  STEP_HZ: 3.4,
  /** スポーン時に既存ボムから離す距離（RADIUS の倍数） */
  SPAWN_MIN_GAP: 2.1,
  SPAWN_TRIES: 16,
  /** 正解時の吸い込み演出の速さ（1/秒） */
  VANISH_SPEED: 6.7,
} as const

export const FUSE = {
  START_SEC: 9.0,
  MIN_SEC: 3.2,
  /** 1 分あたりどれだけ短くなるか */
  DECAY_PER_MIN: 1.6,
  WARN_RATIO: 0.35,
  CRITICAL_RATIO: 0.15,
  /** 導火線の残量を示すドットの数 */
  GAUGE_DOTS: 6,
} as const

export const SPAWN = {
  /**
   * 序盤から複数のボムが四方から出てくるようにしてある。
   * 1 個ずつ処理する単純作業にすると、最初の 30 秒がただの待ち時間になる。
   */
  BURST_AT_START: 3,
  INTERVAL_START: 1.15,
  INTERVAL_MIN: 0.5,
  /** 指数収束の時定数（秒） */
  TAU_SEC: 70,
  JITTER: 0.3,
  FIRST_DELAY: 0.35,
  ALIVE_START: 4,
  ALIVE_CAP: 10,
  ALIVE_STEP_SEC: 20,
  /** 同じ色が続く上限。これを超えたら反対の色を強制する */
  MAX_SAME_KIND_RUN: 3,
} as const

export const SCORE = {
  BASE: 100,
  /** 導火線が長く残っているほど加算されるボーナスの最大値 */
  FUSE_BONUS_MAX: 50,
  COMBO_STEP: 0.2,
  COMBO_MAX_MULT: 5.0,
  /** 最後の成功から次の成功までの猶予。超えるとコンボが切れる（死なない） */
  COMBO_WINDOW: 3.0,
} as const

/** 箱の中に溜まったボムのふるまい */
export const STORE = {
  /** 表示しておける数。超えたら古いものから消える */
  CAP: 28,
  /** 箱の中を歩き回る速さ（箱の幅に対する割合／秒） */
  DRIFT: 0.09,
  /** 見た目の大きさ（本体に対する倍率） */
  SCALE: 0.52,
} as const

export const INPUT = {
  /** 同時に掴めるボムの数。1 にすれば片手操作専用になる */
  MAX_ACTIVE_DRAGS: 2,
} as const

export const FX = {
  MAX_PARTICLES: 160,
  MAX_POPS: 12,
  MAX_RINGS: 8,
  SHAKE_DECAY: 6,
  SHAKE_MISS: 14,
  PARTICLES_MISS: 24,
  PARTICLES_MISS_REDUCED: 6,
} as const

/** 描画のキャップ。3x 端末での塗り面積を抑える */
export const RENDER = {
  MAX_DPR: 2,
} as const

/** localStorage のキー。バージョンを含めて将来のスキーマ変更に備える */
export const STORAGE_KEY = 'bomb-sorter:save:v1'
