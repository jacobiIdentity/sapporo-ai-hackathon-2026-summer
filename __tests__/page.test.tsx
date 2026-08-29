import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import DinnerDecider from '@/app/dinner-decider'
import type { Facts } from '@/lib/decide'

// globals:false のため自動クリーンアップが走らない。残留DOMが次のテストを汚す。
afterEach(cleanup)

beforeEach(() => {
  // 一文生成はネットワーク越し。ここでは結論の表示だけを検証したいので黙らせる。
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})

test('材料が揃っていないときは、結論ではなく誰の何を待っているかを出す', () => {
  render(<DinnerDecider />)

  expect(screen.getByText('あと4つで決まります')).toBeDefined()
  expect(screen.getByText('夫：米を炊いたか')).toBeDefined()
  expect(screen.getByText('妻：実家の残り物')).toBeDefined()
  expect(screen.queryByText('結論')).toBeNull()
})

test('4つ揃うと結論と、誰が何をするかが出る', () => {
  const facts: Facts = { riceCooked: false, hunger: 'now', leftovers: true, detour: true }
  render(<DinnerDecider initialFacts={facts} />)

  expect(screen.getByText('結論')).toBeDefined()
  expect(screen.getByText('実家の残り物で食べる')).toBeDefined()
  expect(screen.getByText('夫：買い物せずまっすぐ帰る')).toBeDefined()
  expect(screen.queryByText(/あと\d+つで決まります/)).toBeNull()
})

test('選択済みの回答は押された状態として公開される', () => {
  render(<DinnerDecider initialFacts={{ riceCooked: true, hunger: null, leftovers: null, detour: null }} />)

  expect(screen.getByRole('button', { name: '炊いた' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '炊いてない' }).getAttribute('aria-pressed')).toBe('false')
})
