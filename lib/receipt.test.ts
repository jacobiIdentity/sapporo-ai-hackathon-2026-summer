import { describe, expect, test } from 'vitest'
import { normalizeIngredients } from './receipt'

describe('normalizeIngredients', () => {
  test('文字列の配列をそのまま返す', () => {
    expect(normalizeIngredients({ ingredients: ['牛乳', '卵', '豚こま'] })).toEqual([
      '牛乳',
      '卵',
      '豚こま',
    ])
  })

  test('前後の空白を落とす', () => {
    expect(normalizeIngredients({ ingredients: ['  牛乳 ', '\n卵'] })).toEqual(['牛乳', '卵'])
  })

  test('空文字と空白だけの要素は捨てる', () => {
    expect(normalizeIngredients({ ingredients: ['牛乳', '', '   ', '卵'] })).toEqual(['牛乳', '卵'])
  })

  test('文字列でない要素は捨てる', () => {
    expect(normalizeIngredients({ ingredients: ['牛乳', 1, null, {}, ['卵']] })).toEqual(['牛乳'])
  })

  test('重複は先に出た方だけ残す', () => {
    expect(normalizeIngredients({ ingredients: ['卵', '牛乳', '卵'] })).toEqual(['卵', '牛乳'])
  })

  test('長すぎる名前は捨てる。読み取り失敗で文章が返ることがあるため', () => {
    const sentence = 'このレシートには食材が含まれていないようです'
    expect(normalizeIngredients({ ingredients: ['牛乳', sentence] })).toEqual(['牛乳'])
  })

  test('件数は20件で打ち切る', () => {
    const many = Array.from({ length: 30 }, (_, i) => `品目${i}`)
    expect(normalizeIngredients({ ingredients: many })).toHaveLength(20)
  })

  test('ingredients が配列でなければ空配列', () => {
    expect(normalizeIngredients({ ingredients: '牛乳' })).toEqual([])
    expect(normalizeIngredients({ ingredients: null })).toEqual([])
    expect(normalizeIngredients({})).toEqual([])
  })

  test('オブジェクトでない入力は空配列', () => {
    expect(normalizeIngredients(null)).toEqual([])
    expect(normalizeIngredients('牛乳')).toEqual([])
    expect(normalizeIngredients(42)).toEqual([])
    expect(normalizeIngredients(undefined)).toEqual([])
  })

  test('空の配列は空配列。食材が写っていないレシートは正常系', () => {
    expect(normalizeIngredients({ ingredients: [] })).toEqual([])
  })
})
