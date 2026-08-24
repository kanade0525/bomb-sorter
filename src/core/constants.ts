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
  /** 論理幅は固定。当たり判定と難易度を全端末で同一にするため */
  LOGICAL_W: 360,
  /** 論理高さはこの範囲で伸縮させ、差は縦余白で吸収する */
  H_MIN: 560,
  H_MAX: 760,
  HUD_H: 64,
  ZONE_H: 140,
  ZONE_GAP: 14,
  EDGE_PAD: 12,
  /** ゾーン下端の余白。ホームインジケータのスワイプ領域を避ける */
  ZONE_BOTTOM_PAD: 16,
} as const

export const BOMB = {
  RADIUS: 26,
  /** 当たり判定の上乗せ。指のズレに優しくする */
  HIT_BONUS: 8,
  /** 漂う速さの基準（論理px/秒） */
  DRIFT_BASE: 14,
  DRIFT_MAX_SCALE: 2.5,
  WOBBLE_HZ: 0.8,
  WOBBLE_AMP: 2.5,
  /** スポーン時に既存ボムから離す距離（RADIUS の倍数） */
  SPAWN_MIN_GAP: 2.2,
  SPAWN_TRIES: 12,
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
} as const

export const SPAWN = {
  INTERVAL_START: 2.2,
  INTERVAL_MIN: 0.62,
  /** 指数収束の時定数（秒） */
  TAU_SEC: 55,
  JITTER: 0.25,
  FIRST_DELAY: 0.6,
  ALIVE_START: 3,
  ALIVE_CAP: 8,
  ALIVE_STEP_SEC: 25,
  /** 同じ形が続く上限。これを超えたら反対の形を強制する */
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
