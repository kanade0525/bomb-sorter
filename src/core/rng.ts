import type { RngState } from './types'

/**
 * mulberry32。状態を値として持ち回れる小さな PRNG。
 * Math.random を使わないのは、同じシードと同じ入力列から同じ結果を再現できるようにして
 * ゲームロジックのテストを決定的にするため。
 */
export function createRng(seed: number): RngState {
  // 0 だと縮退するので必ず非ゼロにする
  return { s: (seed | 0) === 0 ? 0x9e3779b9 : seed | 0 }
}

/** [0, 1) の乱数を返し、state を進める */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0
  let t = rng.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** [min, max) の乱数 */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min)
}

/** -1 か 1 */
export function nextSign(rng: RngState): number {
  return nextFloat(rng) < 0.5 ? -1 : 1
}
