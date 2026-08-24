import { describe, expect, it } from 'vitest'
import { SPAWN, FUSE, BOMB } from '../core/constants'
import { driftScale, fuseLength, maxAlive, spawnInterval } from './difficulty'

describe('spawnInterval', () => {
  it('開始時は初期値と一致する', () => {
    expect(spawnInterval(0)).toBeCloseTo(SPAWN.INTERVAL_START, 6)
  })

  it('時間が進むと単調に短くなる', () => {
    let prev = spawnInterval(0)
    for (let t = 1; t <= 600; t += 1) {
      const cur = spawnInterval(t)
      expect(cur).toBeLessThan(prev)
      prev = cur
    }
  })

  it('下限より短くならない', () => {
    expect(spawnInterval(100000)).toBeGreaterThanOrEqual(SPAWN.INTERVAL_MIN)
    expect(spawnInterval(100000)).toBeCloseTo(SPAWN.INTERVAL_MIN, 6)
  })

  it('負の時間を渡しても初期値を超えない', () => {
    expect(spawnInterval(-100)).toBeCloseTo(SPAWN.INTERVAL_START, 6)
  })
})

describe('fuseLength', () => {
  it('開始時は START_SEC', () => {
    expect(fuseLength(0)).toBeCloseTo(FUSE.START_SEC, 6)
  })

  it('1 分で DECAY_PER_MIN だけ短くなる', () => {
    expect(fuseLength(60)).toBeCloseTo(FUSE.START_SEC - FUSE.DECAY_PER_MIN, 6)
  })

  it('下限で止まる', () => {
    expect(fuseLength(100000)).toBe(FUSE.MIN_SEC)
  })

  it('単調非増加である', () => {
    let prev = fuseLength(0)
    for (let t = 1; t <= 400; t++) {
      const cur = fuseLength(t)
      expect(cur).toBeLessThanOrEqual(prev)
      prev = cur
    }
  })
})

describe('maxAlive', () => {
  it('開始時は ALIVE_START', () => {
    expect(maxAlive(0)).toBe(SPAWN.ALIVE_START)
    expect(maxAlive(24.9)).toBe(SPAWN.ALIVE_START)
  })

  it('ALIVE_STEP_SEC ごとに 1 増える', () => {
    expect(maxAlive(25)).toBe(SPAWN.ALIVE_START + 1)
    expect(maxAlive(50)).toBe(SPAWN.ALIVE_START + 2)
  })

  it('上限で飽和する', () => {
    expect(maxAlive(100000)).toBe(SPAWN.ALIVE_CAP)
  })
})

describe('driftScale', () => {
  it('開始時は 1 倍', () => {
    expect(driftScale(0)).toBe(1)
  })

  it('上限で飽和する', () => {
    expect(driftScale(100000)).toBe(BOMB.DRIFT_MAX_SCALE)
  })
})
