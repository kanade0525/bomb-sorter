/**
 * localStorage に触る唯一の場所。
 *
 * 読み書きは必ず try/catch で包む。setItem は Safari のプライベートブラウズや
 * 容量枯渇で例外を投げるので、失敗しても記録が残らないだけで済むようにしてある
 * （サーバへは何も送らない）。
 *
 * 中身の解釈はしない。壊れた値の正規化は platform/highscore.ts の役目で、
 * どちらの場（素のウェブ / YouTube ゲームルーム）から来た文字列でも
 * 同じ関数で受けられるようにするため、ここでは生の文字列だけを扱う。
 */

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 保存できないだけ。ゲームは続行する
  }
}
