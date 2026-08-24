import { TIMING } from '../core/constants'

export interface StepPlan {
  /** このフレームで回すシミュレーション回数 */
  steps: number
  /** 次フレームへ持ち越す端数 */
  acc: number
  /** 描画の補間係数（0..1） */
  alpha: number
}

/**
 * 固定タイムステップの割り当てを決める純関数。
 *
 * rAF は非アクティブなタブで止まるので、復帰時の delta は数分になり得る。
 * ここで必ずクランプしておかないと、1 フレームでゲームが数分ぶん進んで
 * 全部のボムが同時に爆発する。MAX_STEPS に張り付いたときは端数を捨てて、
 * 「重いほど遅れが溜まってさらに重くなる」死のスパイラルを断つ。
 */
export function planSteps(acc: number, rawDt: number): StepPlan {
  const dt = Math.min(Math.max(rawDt, 0), TIMING.MAX_FRAME_DELTA)
  let a = acc + dt
  let steps = 0
  while (a >= TIMING.FIXED_DT && steps < TIMING.MAX_STEPS) {
    a -= TIMING.FIXED_DT
    steps++
  }
  if (steps >= TIMING.MAX_STEPS) a = 0
  return { steps, acc: a, alpha: a / TIMING.FIXED_DT }
}
