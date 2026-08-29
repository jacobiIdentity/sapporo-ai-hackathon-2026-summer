import { describe, expect, test } from 'vitest'
import { decide, normalizeParsed, resolve, type Facts } from './decide'

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
  test('昨日のケース: 米なし・すぐ食べたい・冷蔵庫の残りあり → 残り物で即決、夫は寄り道しない', () => {
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

describe('自由文から読み取った結果を、トグルの状態に変換する', () => {
  test('4つ揃った応答をそのまま反映する', () => {
    expect(normalizeParsed({ r: 0, h: 'now', l: 1, d: 1 })).toEqual({
      riceCooked: false,
      hunger: 'now',
      leftovers: true,
      detour: true,
    })
  })

  test('読み取れなかった項目は null のまま残す（トグルを未選択で残すため）', () => {
    expect(normalizeParsed({ r: 1, h: null })).toEqual({
      riceCooked: true,
      hunger: null,
      leftovers: null,
      detour: null,
    })
  })

  test('空腹度は now/30/ok と now/soon/later の両方を受ける', () => {
    expect(normalizeParsed({ h: '30' }).hunger).toBe('soon')
    expect(normalizeParsed({ h: 'soon' }).hunger).toBe('soon')
    expect(normalizeParsed({ h: 'ok' }).hunger).toBe('later')
    expect(normalizeParsed({ h: 'later' }).hunger).toBe('later')
  })

  test('想定外の値は捨てて null にする', () => {
    expect(normalizeParsed({ r: 'たぶん', h: 'ぺこぺこ', l: 2, d: {} })).toEqual({
      riceCooked: null,
      hunger: null,
      leftovers: null,
      detour: null,
    })
  })

  test('JSONでないものを渡されても落ちない', () => {
    expect(normalizeParsed(null)).toEqual({
      riceCooked: null,
      hunger: null,
      leftovers: null,
      detour: null,
    })
    expect(normalizeParsed('壊れた応答')).toEqual({
      riceCooked: null,
      hunger: null,
      leftovers: null,
      detour: null,
    })
  })
})

describe('4つ全部は要らない — 決着に必要な情報だけを求める', () => {
  test('残り物あり＋もう限界なら、米と寄り道を知らなくても結論は変わらない', () => {
    const r = resolve({ riceCooked: null, hunger: 'now', leftovers: true, detour: null })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('leftovers')
    // 残り2つを聞く必要がないことを明示する
    expect(r.skipped).toEqual(['riceCooked', 'detour'])
  })

  test('米あり＋残り物なし＋まだ平気なら、寄り道できるかを聞かずに家のごはんで決まる', () => {
    const r = resolve({ riceCooked: true, hunger: 'later', leftovers: false, detour: null })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.plan).toBe('home')
    expect(r.skipped).toEqual(['detour'])
  })

  test('4つ揃っていれば skipped は空', () => {
    const r = resolve({ riceCooked: false, hunger: 'now', leftovers: true, detour: true })
    expect(r.status).toBe('decided')
    if (r.status !== 'decided') return
    expect(r.skipped).toEqual([])
  })

  test('まだ割れているときは、決め手になる1項目を名指しする', () => {
    // 空腹度だけ既知。結論は残り物の有無で割れる。
    const r = resolve({ riceCooked: null, hunger: 'now', leftovers: null, detour: null })
    expect(r.status).toBe('asking')
    if (r.status !== 'asking') return
    expect(r.ask).toBe('leftovers')
  })

  test('名指しした1項目が分かれば、候補が減る', () => {
    const before = resolve(blank)
    const after = resolve({ ...blank, leftovers: true })
    if (before.status !== 'asking' || after.status !== 'asking') throw new Error('both asking')
    expect(after.candidates.length).toBeLessThan(before.candidates.length)
  })

  test('何も分かっていなくても、必ず1つだけ聞く', () => {
    const r = resolve(blank)
    expect(r.status).toBe('asking')
    if (r.status !== 'asking') return
    expect(['riceCooked', 'hunger', 'leftovers', 'detour']).toContain(r.ask)
  })

  test('決着済みなら聞かない', () => {
    const r = resolve({ riceCooked: true, hunger: 'later', leftovers: false, detour: false })
    expect(r.status).toBe('decided')
  })
})
