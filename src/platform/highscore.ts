/**
 * セーブデータの解釈。ここは純関数だけ置く（localStorage には触らない）。
 * Safari のプライベートブラウズや容量枯渇で壊れた値が返ってきても、
 * ゲームが落ちないことを保証する層。
 */
export interface SaveData {
  best: number
  bestCombo: number
  muted: boolean
  plays: number
}

export const DEFAULT_SAVE: SaveData = { best: 0, bestCombo: 0, muted: false, plays: 0 }

function toCount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  if (v < 0) return 0
  // 桁あふれした値を持ち回らない
  return Math.min(Math.floor(v), Number.MAX_SAFE_INTEGER)
}

export function parseSave(raw: string | null | undefined): SaveData {
  if (typeof raw !== 'string' || raw.length === 0) return { ...DEFAULT_SAVE }
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_SAVE }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return { ...DEFAULT_SAVE }
  const o = obj as Record<string, unknown>
  return {
    best: toCount(o['best']),
    bestCombo: toCount(o['bestCombo']),
    muted: o['muted'] === true,
    plays: toCount(o['plays']),
  }
}

export function serializeSave(d: SaveData): string {
  return JSON.stringify({
    best: toCount(d.best),
    bestCombo: toCount(d.bestCombo),
    muted: d.muted === true,
    plays: toCount(d.plays),
  })
}

/** 記録を更新する。下がることはない */
export function mergeBest(cur: SaveData, score: number, combo: number): SaveData {
  return {
    best: Math.max(cur.best, toCount(score)),
    bestCombo: Math.max(cur.bestCombo, toCount(combo)),
    muted: cur.muted,
    plays: cur.plays + 1,
  }
}
