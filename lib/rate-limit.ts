export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number }

export type Limiter = {
  (key: string, now: number): LimitResult
  size(): number
}

/**
 * スライディングウィンドウのレート制限。
 *
 * ponytail: プロセス内メモリなので、インスタンスが複数立つと
 * その数だけ上限が緩む。個人利用の規模ではこれで足り、
 * 厳密にやるなら Vercel KV か WAF のレート制限に載せ替える。
 *
 * 時刻は引数で受け取る。テストを決定的にするため。
 */
export function createLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number
  windowMs: number
  maxKeys?: number
}): Limiter {
  const hits = new Map<string, number[]>()

  const limiter = ((key: string, now: number): LimitResult => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)

    if (recent.length >= limit) {
      hits.set(key, recent)
      const oldest = recent[0]
      return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) }
    }

    recent.push(now)

    // Mapが際限なく育たないように、上限を超えたら古いキーから捨てる。
    // 挿入順に走査されるので先頭が最も古い。
    if (!hits.has(key) && hits.size >= maxKeys) {
      for (const k of hits.keys()) {
        hits.delete(k)
        if (hits.size < maxKeys) break
      }
    }
    hits.set(key, recent)
    return { ok: true }
  }) as Limiter

  limiter.size = () => hits.size
  return limiter
}
