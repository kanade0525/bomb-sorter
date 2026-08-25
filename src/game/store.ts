import { STORE } from '../core/constants'
import { nextFloat, nextRange } from '../core/rng'
import type { BombKind, RngState, StoredBomb } from '../core/types'

/**
 * 箱の中に溜まったボム。
 *
 * 仕分けた結果が消えてしまうと、何個さばいたのかが数字でしか分からない。
 * 入れたボムを箱の中に残してうろうろさせておくと、成果が目に見える。
 * 位置は箱の矩形に対する 0..1 の割合で持つので、画面の大きさが変わっても壊れない。
 */
export function addStored(list: StoredBomb[], kind: BombKind, rng: RngState): void {
  list.push({
    kind,
    u: nextRange(rng, 0.15, 0.85),
    // 入った直後は上の方に現れて、そこから歩き回る
    v: nextRange(rng, 0.05, 0.3),
    du: nextRange(rng, -STORE.DRIFT, STORE.DRIFT),
    dv: nextRange(rng, -STORE.DRIFT, STORE.DRIFT),
    step: nextRange(rng, 0, Math.PI * 2),
    facing: nextFloat(rng) < 0.5 ? -1 : 1,
  })
  // 増えすぎると描画も見た目も重くなるので、古いものから消える
  while (list.length > STORE.CAP) list.shift()
}

/** 箱の中をうろうろさせる。壁で折り返すだけの簡単な動き */
export function stepStored(list: StoredBomb[], dt: number): void {
  for (const s of list) {
    s.step += dt * 5
    s.u += s.du * dt
    s.v += s.dv * dt
    if (s.u < 0.08) {
      s.u = 0.08
      s.du = Math.abs(s.du)
    } else if (s.u > 0.92) {
      s.u = 0.92
      s.du = -Math.abs(s.du)
    }
    if (s.v < 0.06) {
      s.v = 0.06
      s.dv = Math.abs(s.dv)
    } else if (s.v > 0.94) {
      s.v = 0.94
      s.dv = -Math.abs(s.dv)
    }
    s.facing = s.du < 0 ? -1 : 1
  }
}
