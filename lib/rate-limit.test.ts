import { describe, expect, test } from 'vitest'
import { clientKey, createLimiter, tooMany } from './rate-limit'

describe('レート制限', () => {
  test('上限までは通る', () => {
    const limit = createLimiter({ limit: 3, windowMs: 60_000 })
    expect(limit('a', 0).ok).toBe(true)
    expect(limit('a', 1000).ok).toBe(true)
    expect(limit('a', 2000).ok).toBe(true)
  })

  test('上限を超えると落ちて、あと何秒待てばよいか返す', () => {
    const limit = createLimiter({ limit: 2, windowMs: 60_000 })
    limit('a', 0)
    limit('a', 10_000)
    const r = limit('a', 20_000)
    expect(r.ok).toBe(false)
    if (r.ok) return
    // 最初の1件が窓から出るのは 60秒後。いまは20秒なので残り40秒。
    expect(r.retryAfterSec).toBe(40)
  })

  test('窓を過ぎた分は数えないので、待てばまた通る', () => {
    const limit = createLimiter({ limit: 2, windowMs: 60_000 })
    limit('a', 0)
    limit('a', 1000)
    expect(limit('a', 2000).ok).toBe(false)
    expect(limit('a', 61_000).ok).toBe(true)
  })

  test('キーが違えば互いに影響しない', () => {
    const limit = createLimiter({ limit: 1, windowMs: 60_000 })
    expect(limit('a', 0).ok).toBe(true)
    expect(limit('a', 0).ok).toBe(false)
    expect(limit('b', 0).ok).toBe(true)
  })

  test('キーが増え続けてもメモリを食い潰さない', () => {
    const limit = createLimiter({ limit: 1, windowMs: 1000, maxKeys: 10 })
    for (let i = 0; i < 5000; i++) limit(`k${i}`, i)
    // 上限を超えて溜め込まない
    expect(limit.size()).toBeLessThanOrEqual(10)
  })
})

describe('clientKey', () => {
  const withHeaders = (headers: Record<string, string>) =>
    new Request('http://localhost/', { headers })

  test('x-forwarded-for の先頭を使う。後ろはプロキシなので信用しない', () => {
    expect(clientKey(withHeaders({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18' }))).toBe(
      '203.0.113.9',
    )
  })

  test('前後の空白を落とす', () => {
    expect(clientKey(withHeaders({ 'x-forwarded-for': ' 203.0.113.9 ' }))).toBe('203.0.113.9')
  })

  test('ヘッダが無ければ全員が同じ枠に入る。個別に緩めない', () => {
    expect(clientKey(withHeaders({}))).toBe('unknown')
    expect(clientKey(withHeaders({ 'x-forwarded-for': '' }))).toBe('unknown')
  })
})

describe('tooMany', () => {
  test('429と retry-after を返す', async () => {
    const res = tooMany(42)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('42')
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSec: 42 })
  })
})
