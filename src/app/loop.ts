import { TIMING } from '../core/constants'
import { planSteps } from './fixedstep'

export interface Loop {
  start(): void
  stop(): void
  isRunning(): boolean
  /** 復帰時に呼ぶ。前回時刻を今にそろえて巨大 delta を作らない */
  resetClock(): void
  /** 手動で 1 回だけ進める（テスト用フックから使う） */
  advance(ms: number): void
}

export function createLoop(onStep: (dt: number) => void, onRender: (alpha: number) => void): Loop {
  let raf = 0
  let last = 0
  let acc = 0
  let running = false

  const frame = (now: number) => {
    if (!running) return
    const rawDt = (now - last) / 1000
    last = now
    const plan = planSteps(acc, rawDt)
    acc = plan.acc
    for (let i = 0; i < plan.steps; i++) onStep(TIMING.FIXED_DT)
    onRender(plan.alpha)
    raf = requestAnimationFrame(frame)
  }

  return {
    start() {
      if (running) return
      running = true
      last = performance.now()
      acc = 0
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      acc = 0
    },
    isRunning() {
      return running
    },
    resetClock() {
      last = performance.now()
      acc = 0
    },
    advance(ms) {
      const plan = planSteps(acc, ms / 1000)
      acc = plan.acc
      for (let i = 0; i < plan.steps; i++) onStep(TIMING.FIXED_DT)
      onRender(plan.alpha)
    },
  }
}
