import { describe, expect, test } from 'vitest'
import { decide, type Facts } from './decide'

const blank: Facts = { riceCooked: null, hunger: null, leftovers: null, detour: null }

describe('材料が揃うまでは結論を出さない', () => {
  test('何も入っていなければ4件すべてを待つ', () => {
    const r = decide(blank)
    expect(r.status).toBe('waiting')
    if (r.status !== 'waiting') return
    expect(r.missing).toEqual(['riceCooked', 'hunger', 'leftovers', 'detour'])
  })

  test('3件揃っても残り1件を待つ', () => {
    const r = decide({ riceCooked: false, hunger: 'now', leftovers: true, detour: null })
    expect(r.status).toBe('waiting')
    if (r.status !== 'waiting') return
    expect(r.missing).toEqual(['detour'])
  })
})

describe('揃った瞬間に結論が出る', () => {
  test('昨日のケース: 米なし・すぐ食べたい・実家の残りあり → 残り物で即決、夫は寄り道しない', () => {
    const r = decide({ riceCooked: false, hunger: 'now', leftovers: true, detour: true })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('leftovers')
    expect(r.actions.some((a) => a.includes('まっすぐ'))).toBe(true)
  })

  test('米あり・まだ平気 → 家のごはんで足りるので買い物なし', () => {
    const r = decide({ riceCooked: true, hunger: 'later', leftovers: false, detour: false })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('home')
  })

  test('米なし・すぐ食べたい・残り物なし・寄り道できる → 夫が買って帰る', () => {
    const r = decide({ riceCooked: false, hunger: 'now', leftovers: false, detour: true })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('buy')
  })

  test('米なし・すぐ食べたい・残り物なし・寄り道できない → 出前', () => {
    const r = decide({ riceCooked: false, hunger: 'now', leftovers: false, detour: false })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('delivery')
  })

  test('米あり・すぐ食べたい・残り物あり → 残り物が最速なので残り物を優先', () => {
    const r = decide({ riceCooked: true, hunger: 'now', leftovers: true, detour: false })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('leftovers')
  })

  test('結論には必ず理由と、誰が何をするかが入る', () => {
    const r = decide({ riceCooked: false, hunger: 'soon', leftovers: false, detour: true })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.reason.length).toBeGreaterThan(0)
    expect(r.actions.length).toBeGreaterThan(0)
  })
})
