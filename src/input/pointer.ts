import type { InputAction } from '../core/types'
import { toLogical, type Viewport } from '../view/viewport'

export interface PointerInput {
  /** このフレームで処理する入力を取り出す。呼ぶとキューは空になる */
  drain(): InputAction[]
  dispose(): void
}

/**
 * Pointer Events だけで入力を組む。touch/mouse を併記しない。
 *
 * 重要: touchstart に preventDefault を書かないこと。iOS では touch 系を止めると
 * 後続の Pointer Events まで抑制されてドラッグが死ぬ。スクロール抑止は
 * CSS の touch-action: none で行うのが正解。
 */
export function createPointerInput(canvas: HTMLCanvasElement, getVp: () => Viewport): PointerInput {
  let queue: InputAction[] = []
  // 同じ pointerId の move は 1 フレームに 1 件だけ残す（中間点は要らない）
  const moveIndex = new Map<number, number>()

  const pos = (e: PointerEvent) => toLogical(getVp(), e.clientX, e.clientY)

  const onDown = (e: PointerEvent) => {
    // 指が canvas の外へ出ても move が届くようにする
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // 既に解放済みなどは無視してよい
    }
    const p = pos(e)
    moveIndex.delete(e.pointerId)
    queue.push({ t: 'grab', pointerId: e.pointerId, x: p.x, y: p.y })
  }

  const onMove = (e: PointerEvent) => {
    const p = pos(e)
    const idx = moveIndex.get(e.pointerId)
    if (idx !== undefined) {
      const a = queue[idx]
      if (a && a.t === 'move') {
        a.x = p.x
        a.y = p.y
        return
      }
    }
    moveIndex.set(e.pointerId, queue.length)
    queue.push({ t: 'move', pointerId: e.pointerId, x: p.x, y: p.y })
  }

  const onUp = (e: PointerEvent) => {
    const p = pos(e)
    moveIndex.delete(e.pointerId)
    queue.push({ t: 'release', pointerId: e.pointerId, x: p.x, y: p.y })
  }

  const onCancel = (e: PointerEvent) => {
    moveIndex.delete(e.pointerId)
    queue.push({ t: 'cancel', pointerId: e.pointerId })
  }

  // ダブルタップズームと長押しメニューを止める（touch-action で足りない分の保険）
  const onDblClick = (e: Event) => e.preventDefault()
  const onContext = (e: Event) => e.preventDefault()

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)
  canvas.addEventListener('lostpointercapture', onCancel)
  canvas.addEventListener('dblclick', onDblClick)
  canvas.addEventListener('contextmenu', onContext)

  return {
    drain() {
      const out = queue
      queue = []
      moveIndex.clear()
      return out
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('lostpointercapture', onCancel)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('contextmenu', onContext)
    },
  }
}
