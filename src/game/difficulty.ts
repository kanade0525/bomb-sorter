import { BOMB, FUSE, SPAWN } from '../core/constants'

/**
 * スポーン間隔。指数収束で、序盤はゆるく、後半は INTERVAL_MIN に張り付く。
 * t=0 → 2.20s / 30s → 1.51s / 60s → 1.13s / 120s → 0.79s / 240s → 0.64s
 */
export function spawnInterval(t: number): number {
  const d = SPAWN.INTERVAL_START - SPAWN.INTERVAL_MIN
  return SPAWN.INTERVAL_MIN + d * Math.exp(-Math.max(0, t) / SPAWN.TAU_SEC)
}

/**
 * 新しく出てくるボムの導火線の長さ。線形に短くなり下限で止まる。
 * t=0 → 9.0s / 60s → 7.4s / 120s → 5.8s / 217s 以降 → 3.2s
 */
export function fuseLength(t: number): number {
  return Math.max(FUSE.MIN_SEC, FUSE.START_SEC - (FUSE.DECAY_PER_MIN * Math.max(0, t)) / 60)
}

/** 同時に存在できるボムの数。25 秒ごとに 1 増える */
export function maxAlive(t: number): number {
  return Math.min(
    SPAWN.ALIVE_CAP,
    SPAWN.ALIVE_START + Math.floor(Math.max(0, t) / SPAWN.ALIVE_STEP_SEC)
  )
}

/** 歩く速さの倍率 */
export function walkScale(t: number): number {
  return Math.min(BOMB.WALK_MAX_SCALE, 1 + Math.max(0, t) / 110)
}
