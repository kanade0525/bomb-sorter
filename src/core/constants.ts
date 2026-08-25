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
   * 縦持ちと横持ちの両方に対応する。
   *
   * どちらでも「短い方の辺」を 360 に固定する。当たり判定とボムの大きさが
   * 全端末で同じになり、記録の公平性を保てる。長い方の辺だけ端末の比率に
   * 応じて伸縮させ、その差はフィールドの広さとして吸収する。
   */
  LOGICAL_SHORT: 360,
  /** 横持ちのときの論理幅の範囲 */
  LAND_LONG_MIN: 560,
  LAND_LONG_MAX: 900,
  /** 縦持ちのときの論理高さの範囲 */
  PORT_LONG_MIN: 540,
  PORT_LONG_MAX: 780,
  /** 大画面で拡大しすぎるとスマホ向けの操作感から離れるので上限を置く */
  MAX_SCALE: 1.6,
  /** HUD の高さ。縦持ちは横幅が足りないので 2 段組みにする分だけ高い */
  HUD_H_LANDSCAPE: 40,
  /**
   * 縦持ちは横幅が足りず、得点と連鎖を 1 行に並べられない。
   * 2 段（得点 / 連鎖＋ゲージ）がちょうど収まる高さにしてある。
   * 足りないと、連鎖のゲージがフィールドへはみ出してトラロープに重なる。
   */
  HUD_H_PORTRAIT: 86,
  /** 横持ちのときの、左右の箱の幅 */
  ZONE_W: 136,
  /** 縦持ちのときの、下に並ぶ箱の高さ */
  ZONE_H_PORTRAIT: 150,
  /** 箱とフィールドの隙間 */
  ZONE_GAP: 12,
  EDGE_PAD: 10,
  /**
   * HUD の右側で、DOM のボタン（全画面・音・一時停止）のために空けておく論理幅。
   * ボタンは Canvas の外にある DOM なので、Canvas 側の描画がここへ入り込むと重なる。
   */
  HUD_RESERVED_RIGHT: 156,
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
  START_SEC: 13.0,
  /** 終盤でもこれ以下にはしない。短くしすぎると運ぶ時間そのものが足りなくなる */
  MIN_SEC: 4.5,
  /** 1 分あたりどれだけ短くなるか。急がせすぎない */
  DECAY_PER_MIN: 1.0,
  WARN_RATIO: 0.35,
  CRITICAL_RATIO: 0.15,
  /** 導火線の残量を示すドットの数 */
  GAUGE_DOTS: 6,
} as const

export const SPAWN = {
  /**
   * 最初に置く数。少なめにする。
   *
   * 一度は開始時点で 10 体置いてみたが、いきなり捌ききれない量が並ぶと
   * 「難しい」ではなく「もう無理」に見えて手が止まる。数体から始めて、
   * 短い間隔で次々と湧いてくる形にすると、増えていく手応えが出る。
   */
  BURST_AT_START: 3,
  /** 短い間隔で湧かせる。上限に達している間はタイマーが止まるので溢れはしない */
  INTERVAL_START: 0.9,
  INTERVAL_MIN: 0.45,
  /** 指数収束の時定数（秒）。大きいほど難しくなるのがゆっくりになる */
  TAU_SEC: 75,
  JITTER: 0.3,
  FIRST_DELAY: 0.5,
  ALIVE_START: 5,
  ALIVE_CAP: 14,
  ALIVE_STEP_SEC: 18,
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
  CAP: 44,
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
