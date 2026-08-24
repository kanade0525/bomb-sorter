import { STORAGE_KEY } from '../core/constants'
import { DEFAULT_SAVE, parseSave, serializeSave, type SaveData } from './highscore'

/**
 * localStorage の I/O。読み書きは必ず try/catch で包む。
 * setItem は Safari のプライベートブラウズや容量枯渇で例外を投げるので、
 * 失敗しても記録が残らないだけで済むようにしてある（サーバへは何も送らない）。
 */
export function loadSave(): SaveData {
  try {
    return parseSave(localStorage.getItem(STORAGE_KEY))
  } catch {
    return { ...DEFAULT_SAVE }
  }
}

export function saveSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSave(data))
  } catch {
    // 保存できないだけ。ゲームは続行する
  }
}
