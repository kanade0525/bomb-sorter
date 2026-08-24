import { SCORE } from '../core/constants'

/**
 * combo は「この成功より前に連続していた成功数」。
 * つまり初成功は combo=0 で 1.0 倍、20 連鎖後に 5.0 倍で頭打ちになる。
 */
export function comboMultiplier(combo: number): number {
  const c = Math.max(0, combo)
  return Math.min(SCORE.COMBO_MAX_MULT, 1 + c * SCORE.COMBO_STEP)
}

/**
 * 得点。導火線が長く残っているほど高い（早く捌く動機になる）。
 * 例: 残り 80%・コンボ 5 → round((100 + 50*0.8) * 2.0) = 280
 */
export function scoreGain(fuseRatio: number, combo: number): number {
  const r = fuseRatio < 0 ? 0 : fuseRatio > 1 ? 1 : fuseRatio
  return Math.round((SCORE.BASE + SCORE.FUSE_BONUS_MAX * r) * comboMultiplier(combo))
}
