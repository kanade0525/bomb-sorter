export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 2 点間の距離の 2 乗。平方根を避けたい当たり判定用 */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** 点が円の内側にあるか */
export function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  return dist2(px, py, cx, cy) <= r * r
}
