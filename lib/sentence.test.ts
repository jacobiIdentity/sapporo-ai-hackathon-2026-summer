import { describe, expect, test } from 'vitest'
import { decide, resolve, type Facts, type Hunger } from './decide'
import { sentenceFor } from './sentence'

const VALUES = {
  riceCooked: [true, false],
  hunger: ['now', 'soon', 'later'] as Hunger[],
  leftovers: [true, false],
  detour: [true, false],
}

const ALL: Facts[] = VALUES.riceCooked.flatMap((riceCooked) =>
  VALUES.hunger.flatMap((hunger) =>
    VALUES.leftovers.flatMap((leftovers) =>
      VALUES.detour.map((detour) => ({ riceCooked, hunger, leftovers, detour })),
    ),
  ),
)

/** 4項目のうち一部だけ埋まった状態も含めた全パターン。resolveはここでも決着しうる。 */
const PARTIAL: Facts[] = [null, ...VALUES.riceCooked].flatMap((riceCooked) =>
  [null, ...VALUES.hunger].flatMap((hunger) =>
    [null, ...VALUES.leftovers].flatMap((leftovers) =>
      [null, ...VALUES.detour].map((detour) => ({ riceCooked, hunger, leftovers, detour }) as Facts),
    ),
  ),
)

describe('一文は事前生成され固定されている', () => {
  test('24通りすべての入力に一文がある', () => {
    const missing = ALL.filter((f) => {
      const d = decide(f)
      return d.status === 'decided' && sentenceFor(d) === null
    })
    expect(missing).toEqual([])
  })

  test('一部しか埋まっていなくても、決着したものには必ず一文がある', () => {
    const missing = PARTIAL.filter((f) => {
      const r = resolve(f)
      return r.status === 'decided' && sentenceFor(r) === null
    })
    expect(missing).toEqual([])
  })

  test('同じ結論なら何度呼んでも同じ一文（決定的）', () => {
    const facts: Facts = { riceCooked: false, hunger: 'now', leftovers: true, detour: true }
    const d = decide(facts)
    if (d.status !== 'decided') throw new Error('decided')
    const first = sentenceFor(d)
    expect(first).not.toBeNull()
    for (let i = 0; i < 5; i++) expect(sentenceFor(decide(facts) as typeof d)).toBe(first)
  })

  test('一文は送れる日本語になっている', () => {
    const d = decide({ riceCooked: false, hunger: 'now', leftovers: true, detour: true })
    if (d.status !== 'decided') throw new Error('decided')
    const s = sentenceFor(d) ?? ''
    expect(s.length).toBeGreaterThan(10)
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s).toMatch(/。$/)
  })
})
