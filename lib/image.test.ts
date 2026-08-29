import { describe, expect, test } from 'vitest'
import { fitWithin } from './image'

describe('fitWithin', () => {
  test('長辺が上限以下ならそのまま返す。拡大はしない', () => {
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1568, 1000, 1568)).toEqual({ width: 1568, height: 1000 })
  })

  test('横長は幅を上限に合わせ、比率を保つ', () => {
    expect(fitWithin(3000, 1500, 1500)).toEqual({ width: 1500, height: 750 })
  })

  test('縦長は高さを上限に合わせ、比率を保つ。レシートはこの向き', () => {
    expect(fitWithin(1500, 3000, 1500)).toEqual({ width: 750, height: 1500 })
  })

  test('端数は四捨五入し、1px を下回らない', () => {
    expect(fitWithin(1000, 3, 100)).toEqual({ width: 100, height: 1 })
  })
})
