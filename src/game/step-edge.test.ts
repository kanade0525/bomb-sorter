import { describe, expect, it } from 'vitest'
import { FIELD, INPUT, SCORE, SPAWN, TIMING } from '../core/constants'
import type { Bomb, BombKind, InputAction, Layout, World } from '../core/types'
import { computeLayout } from '../view/layout'
import { applyCommand, stepWorld } from './step'
import { createWorld } from './world'

const LAYOUT = computeLayout(760, 360)

/** playing に入った状態の世界を作る */
function started(seed = 1): World {
  const w = createWorld(seed, LAYOUT)
  applyCommand(w, 'start', LAYOUT)
  stepWorld(w, TIMING.READY_SEC + 0.001, [], LAYOUT)
  expect(w.phase).toBe('playing')
  return w
}

function zoneRect(kind: BombKind, layout: Layout = LAYOUT) {
  const z = layout.zones.find((x) => x.kind === kind)
  if (!z) throw new Error('ゾーンが見つからない')
  return z.rect
}

function zoneCenter(kind: BombKind, layout: Layout = LAYOUT) {
  const r = zoneRect(kind, layout)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

function living(w: World): Bomb[] {
  return w.bombs.filter((b) => b.vanish === 0)
}

function firstBomb(w: World): Bomb {
  const b = living(w)[0]
  if (!b) throw new Error('ボムがない')
  return b
}

/** ボムが n 個以上になるまで、導火線を補充しながら進める */
function growTo(w: World, n: number): Bomb[] {
  for (let i = 0; i < 60 * 40 && living(w).length < n; i++) {
    for (const x of w.bombs) x.fuse = x.fuseMax
    stepWorld(w, 1 / 60, [], LAYOUT)
  }
  const bs = living(w)
  expect(bs.length).toBeGreaterThanOrEqual(n)
  return bs
}

/** 数値がすべて有限か。NaN / Infinity の汚染を一括で見る */
function allFinite(w: World): boolean {
  const nums = [w.time, w.phaseTime, w.score, w.combo, w.comboTimer, w.spawnTimer, w.sorted]
  for (const b of w.bombs) {
    nums.push(b.x, b.y, b.dir, b.speed, b.turnTimer, b.fuse, b.fuseMax, b.step, b.vanish)
  }
  for (const list of [w.stored.red, w.stored.black]) {
    for (const s of list) nums.push(s.u, s.v, s.du, s.dv, s.step)
  }
  return nums.every((n) => Number.isFinite(n))
}

function snapshot(w: World) {
  return JSON.stringify({
    phase: w.phase,
    time: w.time,
    score: w.score,
    combo: w.combo,
    comboTimer: w.comboTimer,
    spawnTimer: w.spawnTimer,
    sorted: w.sorted,
    rng: w.rng.s,
    bombs: w.bombs.map((b) => ({ id: b.id, k: b.kind, x: b.x, y: b.y, f: b.fuse, v: b.vanish })),
  })
}

describe('dt の異常系', () => {
  it('dt = 0 では状態が一切変わらない', () => {
    const w = started()
    const before = snapshot(w)
    w.effects.length = 0
    stepWorld(w, 0, [], LAYOUT)
    expect(snapshot(w)).toBe(before)
    expect(w.effects).toEqual([])
  })

  it('dt = 0 を大量に送ってもスポーンも爆発もしない', () => {
    const w = started()
    const before = snapshot(w)
    for (let i = 0; i < 1000; i++) stepWorld(w, 0, [], LAYOUT)
    expect(snapshot(w)).toBe(before)
    expect(w.phase).toBe('playing')
  })

  it('dt が負でも NaN にならず、勝手に死なない', () => {
    const w = started()
    const fuse = firstBomb(w).fuse
    for (let i = 0; i < 60; i++) stepWorld(w, -1 / 60, [], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(allFinite(w)).toBe(true)
    // 負の dt は時間を巻き戻すだけ。導火線は伸びる
    expect(firstBomb(w).fuse).toBeGreaterThan(fuse)
  })

  it('負の dt のあとに正の dt を送っても壊れない', () => {
    const w = started()
    stepWorld(w, -5, [], LAYOUT)
    for (let i = 0; i < 60 * 3; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    expect(allFinite(w)).toBe(true)
    expect(w.phase).toBe('playing')
  })

  it('巨大な dt（30 秒）を 1 回渡しても壊れない（導火線切れで死ぬだけ）', () => {
    const w = started()
    stepWorld(w, 30, [], LAYOUT)
    expect(allFinite(w)).toBe(true)
    expect(w.phase).toBe('exploding')
    expect(w.deathReason).toBe('fuse')
    // 演出も 1 回で終わる長さ
    stepWorld(w, 30, [], LAYOUT)
    expect(w.phase).toBe('gameover')
    expect(allFinite(w)).toBe(true)
  })

  it('巨大な dt でもボムは 1 フレームに 1 個しか増えない', () => {
    const w = started()
    const n = w.bombs.length
    for (const x of w.bombs) x.fuse = 1e9
    stepWorld(w, 30, [], LAYOUT)
    expect(w.bombs.length).toBe(n + 1)
  })

  it('タイトル画面に巨大な dt を渡してもボムがフィールドから飛び出さない', () => {
    const w = createWorld(7, LAYOUT)
    stepWorld(w, 60, [], LAYOUT)
    expect(w.phase).toBe('title')
    for (const b of w.bombs) {
      expect(b.x).toBeGreaterThanOrEqual(LAYOUT.field.x)
      expect(b.x).toBeLessThanOrEqual(LAYOUT.field.x + LAYOUT.field.w)
      expect(b.y).toBeGreaterThanOrEqual(LAYOUT.field.y)
      expect(b.y).toBeLessThanOrEqual(LAYOUT.field.y + LAYOUT.field.h)
    }
  })
})

describe('入力の異常系', () => {
  it('ボムが 0 個でも入力を送って落ちない', () => {
    const w = started()
    w.bombs = []
    const acts: InputAction[] = [
      { t: 'grab', pointerId: 1, x: 100, y: 200 },
      { t: 'move', pointerId: 1, x: 120, y: 220 },
      { t: 'release', pointerId: 1, x: zoneCenter('red').x, y: zoneCenter('red').y },
      { t: 'cancel', pointerId: 1 },
    ]
    expect(() => stepWorld(w, 1 / 60, acts, LAYOUT)).not.toThrow()
    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
    expect(w.effects.some((e) => e.t === 'grab')).toBe(false)
  })

  it('存在しない pointerId の move / release / cancel は黙って無視される', () => {
    const w = started()
    const b = firstBomb(w)
    const before = { x: b.x, y: b.y }
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'move', pointerId: 99, x: 10, y: 10 },
        { t: 'release', pointerId: 98, x: zoneCenter('red').x, y: zoneCenter('red').y },
        { t: 'cancel', pointerId: 97 },
      ],
      LAYOUT
    )
    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
    const after = firstBomb(w)
    // drift のぶんしか動かない
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(2)
  })

  it('掴んでいる指と違う pointerId で離しても判定は起きない', () => {
    const w = started()
    const b = firstBomb(w)
    const wrong = zoneCenter(b.kind === 'red' ? 'black' : 'red')
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 2, x: wrong.x, y: wrong.y }], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(w.bombs.some((x) => x.grabbedBy === 1)).toBe(true)
  })

  it('cancel した後に同じ pointerId で release が来ても無視される', () => {
    const w = started()
    const b = firstBomb(w)
    const wrong = zoneCenter(b.kind === 'red' ? 'black' : 'red')
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'cancel', pointerId: 1 },
        { t: 'release', pointerId: 1, x: wrong.x, y: wrong.y },
      ],
      LAYOUT
    )
    expect(w.phase).toBe('playing')
  })

  it('同一フレームに grab / move / release を全部詰めても成立する', () => {
    const w = started()
    const b = firstBomb(w)
    const to = zoneCenter(b.kind)
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'grab', pointerId: 1, x: b.x, y: b.y },
        { t: 'move', pointerId: 1, x: to.x, y: to.y },
        { t: 'release', pointerId: 1, x: to.x, y: to.y },
      ],
      LAYOUT
    )
    expect(w.phase).toBe('playing')
    expect(w.sorted).toBe(1)
    expect(w.score).toBeGreaterThan(0)
  })

  it('1 本の指が同時に掴めるボムは 1 個までである', () => {
    // pointerup を取りこぼした後の pointerdown（マウスの多ボタン押しでも起きる）を想定。
    // 2 個目を掴んでしまうと、findGrabbed が 1 個目しか見ないため
    // 2 個目が「永久に掴まれたまま」になり、触れないのに時間切れで死ぬ
    const w = started()
    const bs = growTo(w, 2)
    const a = bs[0]!
    const b = bs[1]!
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: a.x, y: a.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    expect(w.bombs.filter((x) => x.grabbedBy === 1).length).toBe(1)
  })

  it('離した後に掴まれたままのボムが残らない', () => {
    const w = started()
    const bs = growTo(w, 2)
    const a = bs[0]!
    const b = bs[1]!
    const back = { x: LAYOUT.field.x + LAYOUT.field.w / 2, y: LAYOUT.field.y + 40 }
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: a.x, y: a.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: back.x, y: back.y }], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(w.bombs.filter((x) => x.grabbedBy !== null)).toEqual([])
  })

  it('上限まで掴んでいても、1 本離せばまた掴める', () => {
    const w = started()
    const bs = growTo(w, 3)
    const acts: InputAction[] = bs
      .slice(0, INPUT.MAX_ACTIVE_DRAGS)
      .map((b, i) => ({ t: 'grab' as const, pointerId: i + 1, x: b.x, y: b.y }))
    stepWorld(w, 1 / 60, acts, LAYOUT)
    expect(w.bombs.filter((b) => b.grabbedBy !== null).length).toBe(INPUT.MAX_ACTIVE_DRAGS)

    stepWorld(w, 1 / 60, [{ t: 'cancel', pointerId: 1 }], LAYOUT)
    const free = living(w).find((b) => b.grabbedBy === null)!
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 9, x: free.x, y: free.y }], LAYOUT)
    expect(w.bombs.some((b) => b.grabbedBy === 9)).toBe(true)
  })

  it('同じ座標への grab 連打で掴まれるボムが増え続けない', () => {
    const w = started()
    const bs = growTo(w, 3)
    const at = bs[0]!
    const acts: InputAction[] = []
    for (let i = 0; i < 20; i++) acts.push({ t: 'grab', pointerId: 1, x: at.x, y: at.y })
    stepWorld(w, 1 / 60, acts, LAYOUT)
    expect(w.phase).toBe('playing')
    expect(w.bombs.filter((b) => b.grabbedBy !== null).length).toBeLessThanOrEqual(
      INPUT.MAX_ACTIVE_DRAGS
    )
  })
})

describe('ゾーン境界での判定', () => {
  /** ボムの中心を指定座標へ運んで離す（holdDx = 0 になるよう中心を掴む） */
  function dropAt(w: World, bomb: Bomb, x: number, y: number): void {
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: bomb.x, y: bomb.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x, y }], LAYOUT)
  }

  it('ゾーンの左上の境界ちょうどは内側として扱う', () => {
    const w = started()
    const b = firstBomb(w)
    const r = zoneRect(b.kind)
    dropAt(w, b, r.x, r.y)
    expect(w.phase).toBe('playing')
    expect(w.sorted).toBe(1)
  })

  it('箱の右端ちょうどは外側なので、箱の外へ落として無得点になる', () => {
    // containsPoint は右下を含まない取り決め。左の箱の右端は箱の外なので死なない
    const w = started()
    const b = firstBomb(w)
    const left = zoneRect('red')
    dropAt(w, b, left.x + left.w, left.y + 10)
    expect(w.phase).toBe('playing')
    expect(w.sorted).toBe(0)
    expect(w.score).toBe(0)
  })

  it('ゾーンの下端の 1px 手前で離せば正解になる', () => {
    const w = started()
    const b = firstBomb(w)
    const r = zoneRect(b.kind)
    dropAt(w, b, r.x + r.w / 2, r.y + r.h - 1)
    expect(w.sorted).toBe(1)
  })

  it('画面の下端いっぱいまでドラッグして離しても正解として扱われる', () => {
    // dragBounds の maxY は「ゾーン下端 = containsPoint が含まない座標」に一致する。
    // 指を画面の下まで引っ張って離すと、見た目はゾーンの中なのに無得点になってしまう
    const w = started()
    const b = firstBomb(w)
    const r = zoneRect(b.kind)
    dropAt(w, b, r.x + r.w / 2, LAYOUT.logicalH + 500)
    expect(w.sorted).toBe(1)
    expect(w.score).toBeGreaterThan(0)
  })

  it('ゾーンの隙間で離しても死なずフィールドへ戻る', () => {
    const w = started()
    const b = firstBomb(w)
    const left = zoneRect('black')
    const right = zoneRect('red')
    const midX = (left.x + left.w + right.x) / 2
    dropAt(w, b, midX, left.y + 20)
    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
    const after = living(w)[0]!
    expect(after.y).toBeLessThanOrEqual(LAYOUT.field.y + LAYOUT.field.h + 0.001)
  })
})

describe('消滅中のボム', () => {
  function sortOne(w: World): Bomb {
    const b = firstBomb(w)
    const to = zoneCenter(b.kind)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: to.x, y: to.y }], LAYOUT)
    expect(b.vanish).toBeGreaterThan(0)
    return b
  }

  it('消滅中のボムは掴めない', () => {
    const w = started()
    const b = sortOne(w)
    w.effects.length = 0 // 仕分け時に積まれた分を捨ててから見る
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 2, x: b.x, y: b.y }], LAYOUT)
    expect(b.grabbedBy).toBeNull()
    expect(w.effects.some((e) => e.t === 'grab')).toBe(false)
  })

  it('消滅中のボムがゾーンの上にあっても二重に加点されない', () => {
    const w = started()
    const b = sortOne(w)
    const score = w.score
    const sorted = w.sorted
    for (let i = 0; i < 30; i++) {
      // ゾーン上に居座らせたまま進める
      b.x = zoneCenter(b.kind).x
      b.y = zoneCenter(b.kind).y
      stepWorld(w, 1 / 60, [], LAYOUT)
    }
    expect(w.score).toBe(score)
    expect(w.sorted).toBe(sorted)
    expect(w.phase).toBe('playing')
  })

  it('消滅中のボムは導火線が尽きても爆発しない', () => {
    const w = started()
    const b = sortOne(w)
    b.fuse = 0.0001
    // 消滅しきる前に何度も回す
    b.vanish = 0.0001
    for (let i = 0; i < 5; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.phase).toBe('playing')
  })

  it('消滅が終わると配列から消える', () => {
    const w = started()
    const b = sortOne(w)
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.bombs.some((x) => x.id === b.id)).toBe(false)
  })
})

describe('プレイ中以外の入力', () => {
  const phases: { name: string; make: () => World }[] = [
    {
      name: 'paused',
      make: () => {
        const w = started()
        applyCommand(w, 'pause', LAYOUT)
        return w
      },
    },
    {
      name: 'exploding',
      make: () => {
        const w = started()
        const b = firstBomb(w)
        const wrong = zoneCenter(b.kind === 'red' ? 'black' : 'red')
        stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
        stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: wrong.x, y: wrong.y }], LAYOUT)
        expect(w.phase).toBe('exploding')
        return w
      },
    },
    {
      name: 'gameover',
      make: () => {
        const w = started()
        const b = firstBomb(w)
        const wrong = zoneCenter(b.kind === 'red' ? 'black' : 'red')
        stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
        stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: wrong.x, y: wrong.y }], LAYOUT)
        stepWorld(w, TIMING.EXPLODE_SEC + 0.01, [], LAYOUT)
        expect(w.phase).toBe('gameover')
        return w
      },
    },
    {
      name: 'title',
      make: () => createWorld(3, LAYOUT),
    },
  ]

  for (const p of phases) {
    it(`${p.name} 中の入力では何も起きない`, () => {
      const w = p.make()
      w.effects.length = 0 // 準備段階で積まれた分を捨ててから見る
      const target = w.bombs[0]
      const score = w.score
      const sorted = w.sorted
      const phase = w.phase
      const acts: InputAction[] = target
        ? [
            { t: 'grab', pointerId: 1, x: target.x, y: target.y },
            { t: 'move', pointerId: 1, x: zoneCenter('red').x, y: zoneCenter('red').y },
            { t: 'release', pointerId: 1, x: zoneCenter('red').x, y: zoneCenter('red').y },
          ]
        : []
      stepWorld(w, 1 / 60, acts, LAYOUT)
      expect(w.score).toBe(score)
      expect(w.sorted).toBe(sorted)
      expect(w.bombs.every((b) => b.grabbedBy === null)).toBe(true)
      expect(w.effects.some((e) => e.t === 'grab' || e.t === 'ok' || e.t === 'miss')).toBe(false)
      // title は演出が進むので phase が変わらないことだけを見る
      if (phase !== 'exploding') expect(w.phase).toBe(phase)
    })
  }
})

describe('壊れたレイアウト', () => {
  it('zones が空でも落ちず、離した位置に関わらずフィールドへ戻る', () => {
    const w = started()
    const noZones: Layout = { ...LAYOUT, zones: [] }
    const b = firstBomb(w)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], noZones)
    expect(() =>
      stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: 180, y: 620 }], noZones)
    ).not.toThrow()
    expect(w.phase).toBe('playing')
    expect(w.score).toBe(0)
    const after = firstBomb(w)
    expect(after.y).toBeLessThanOrEqual(LAYOUT.field.y + LAYOUT.field.h + 0.001)
  })

  it('zones が空のまま長く回しても壊れない', () => {
    const w = started()
    const noZones: Layout = { ...LAYOUT, zones: [] }
    for (let i = 0; i < 60 * 10; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], noZones)
    }
    expect(allFinite(w)).toBe(true)
  })

  it('フィールドが下限まで潰れたレイアウトでも成立する', () => {
    const squashed = computeLayout(FIELD.W_MIN, FIELD.LOGICAL_H)
    const w = createWorld(11, squashed)
    applyCommand(w, 'start', squashed)
    stepWorld(w, TIMING.READY_SEC + 0.001, [], squashed)
    for (let i = 0; i < 60 * 10; i++) {
      for (const x of w.bombs) x.fuse = x.fuseMax
      stepWorld(w, 1 / 60, [], squashed)
      for (const b of w.bombs) {
        expect(Number.isFinite(b.x)).toBe(true)
        expect(Number.isFinite(b.y)).toBe(true)
      }
    }
    expect(allFinite(w)).toBe(true)
  })
})

describe('同じフレームに重なる出来事', () => {
  it('別のボムの導火線が尽きるフレームに正解を入れても、その得点は入る', () => {
    const w = started()
    const bs = growTo(w, 2)
    const good = bs[0]!
    const doomed = bs[1]!
    const to = zoneCenter(good.kind)
    doomed.fuse = 1 / 120 // このフレームで尽きる
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'grab', pointerId: 1, x: good.x, y: good.y },
        { t: 'release', pointerId: 1, x: to.x, y: to.y },
      ],
      LAYOUT
    )
    // 入力は導火線の更新より先に処理される、が取り決め
    expect(w.sorted).toBe(1)
    expect(w.score).toBeGreaterThan(0)
    expect(w.phase).toBe('exploding')
    expect(w.deathReason).toBe('fuse')
  })

  it('誤爆と同じフレームの後続入力は処理されない', () => {
    const w = started()
    const bs = growTo(w, 2)
    const a = bs[0]!
    const b = bs[1]!
    const wrong = zoneCenter(a.kind === 'red' ? 'black' : 'red')
    const right = zoneCenter(b.kind)
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'grab', pointerId: 1, x: a.x, y: a.y },
        { t: 'release', pointerId: 1, x: wrong.x, y: wrong.y },
        { t: 'grab', pointerId: 2, x: b.x, y: b.y },
        { t: 'release', pointerId: 2, x: right.x, y: right.y },
      ],
      LAYOUT
    )
    expect(w.phase).toBe('exploding')
    expect(w.score).toBe(0)
    expect(w.sorted).toBe(0)
  })

  it('死んだ瞬間に掴んでいた指はすべて外れる', () => {
    const w = started()
    const bs = growTo(w, 2)
    const a = bs[0]!
    const b = bs[1]!
    const wrong = zoneCenter(a.kind === 'red' ? 'black' : 'red')
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 2, x: b.x, y: b.y }], LAYOUT)
    stepWorld(
      w,
      1 / 60,
      [
        { t: 'grab', pointerId: 1, x: a.x, y: a.y },
        { t: 'release', pointerId: 1, x: wrong.x, y: wrong.y },
      ],
      LAYOUT
    )
    expect(w.phase).toBe('exploding')
    expect(w.bombs.every((x) => x.grabbedBy === null)).toBe(true)
  })
})

describe('フェーズ操作の連打', () => {
  it('restart を連打しても初期化が二重に走らない', () => {
    const w = started()
    const b = firstBomb(w)
    const wrong = zoneCenter(b.kind === 'red' ? 'black' : 'red')
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: wrong.x, y: wrong.y }], LAYOUT)
    stepWorld(w, TIMING.EXPLODE_SEC + 0.01, [], LAYOUT)
    expect(w.phase).toBe('gameover')

    for (let i = 0; i < 10; i++) applyCommand(w, 'restart', LAYOUT)
    expect(w.phase).toBe('ready')
    expect(w.bombs.length).toBe(SPAWN.BURST_AT_START)
    expect(w.score).toBe(0)
    // 初期化が二重に走っていれば、id は初期スポーンぶんより先へ進んでいる
    expect(w.nextId).toBe(SPAWN.BURST_AT_START + 1)
    stepWorld(w, TIMING.READY_SEC + 0.001, [], LAYOUT)
    expect(w.phase).toBe('playing')
  })

  it('pause / resume を連打しても playing に戻れる', () => {
    const w = started()
    for (let i = 0; i < 5; i++) {
      applyCommand(w, 'pause', LAYOUT)
      applyCommand(w, 'pause', LAYOUT)
      applyCommand(w, 'resume', LAYOUT)
      applyCommand(w, 'resume', LAYOUT)
    }
    expect(w.phase).toBe('ready')
    stepWorld(w, TIMING.READY_SEC + 0.001, [], LAYOUT)
    expect(w.phase).toBe('playing')
    expect(allFinite(w)).toBe(true)
  })

  it('ポーズ中の restart でもスコアが初期化される', () => {
    const w = started()
    const b = firstBomb(w)
    const to = zoneCenter(b.kind)
    stepWorld(w, 1 / 60, [{ t: 'grab', pointerId: 1, x: b.x, y: b.y }], LAYOUT)
    stepWorld(w, 1 / 60, [{ t: 'release', pointerId: 1, x: to.x, y: to.y }], LAYOUT)
    expect(w.score).toBeGreaterThan(0)
    applyCommand(w, 'pause', LAYOUT)
    applyCommand(w, 'restart', LAYOUT)
    expect(w.phase).toBe('ready')
    expect(w.score).toBe(0)
    expect(w.bombs.length).toBe(SPAWN.BURST_AT_START)
  })

  it('start を連打してもゲームが二重に始まらない', () => {
    const w = createWorld(5, LAYOUT)
    for (let i = 0; i < 5; i++) applyCommand(w, 'start', LAYOUT)
    expect(w.phase).toBe('ready')
    expect(w.bombs.length).toBe(SPAWN.BURST_AT_START)
  })
})

describe('長時間の連続プレイ', () => {
  it('10 分相当を回してもスコアと座標が有限のまま', () => {
    const w = started(20240825)
    const frames = 60 * 600
    for (let i = 0; i < frames; i++) {
      // 導火線が短いボムから順に正しいゾーンへ捨てる自動プレイ
      const acts: InputAction[] = []
      let pid = 1
      for (const b of living(w)) {
        if (b.grabbedBy !== null || b.fuse > 2) continue
        const to = zoneCenter(b.kind)
        acts.push({ t: 'grab', pointerId: pid, x: b.x, y: b.y })
        acts.push({ t: 'release', pointerId: pid, x: to.x, y: to.y })
        pid++
        if (pid > INPUT.MAX_ACTIVE_DRAGS) break
      }
      stepWorld(w, 1 / 60, acts, LAYOUT)
      w.effects.length = 0
      if (w.phase !== 'playing') break
    }

    expect(w.phase).toBe('playing')
    expect(allFinite(w)).toBe(true)
    expect(w.time).toBeGreaterThan(590)
    expect(w.score).toBeGreaterThan(0)
    expect(Number.isSafeInteger(w.score)).toBe(true)
    expect(w.sorted).toBeGreaterThan(100)
    expect(w.comboTimer).toBeLessThanOrEqual(SCORE.COMBO_WINDOW)
    expect(w.bombs.length).toBeLessThanOrEqual(16)
    for (const b of w.bombs) {
      expect(b.step).toBeLessThan(Number.MAX_SAFE_INTEGER)
      expect(b.speed).toBeLessThan(1000)
    }
  })

  it('放置で死んだあと 10 分放置しても状態が壊れない', () => {
    const w = started()
    for (let i = 0; i < 60 * 600; i++) stepWorld(w, 1 / 60, [], LAYOUT)
    expect(w.phase).toBe('gameover')
    expect(allFinite(w)).toBe(true)
  })
})
