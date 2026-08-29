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

test('まだ決まらないときは、結論ではなく決め手になる1問だけを出す', () => {
  render(<DinnerDecider />)

  expect(screen.getByText('これを聞けば決まります')).toBeDefined()
  expect(screen.getByText('夫：米を炊いたか')).toBeDefined()
  // 残りを羅列しない。出すのは1問だけ。
  expect(screen.queryByText('妻：冷蔵庫の残り物')).toBeNull()
  expect(screen.queryByText('夫：寄り道して買えるか')).toBeNull()
  expect(screen.queryByText('結論')).toBeNull()
})

test('空腹度が分かると、次に聞くべきは冷蔵庫の残り物に変わる', () => {
  render(
    <DinnerDecider
      initialFacts={{ riceCooked: null, hunger: 'now', leftovers: null, detour: null }}
    />,
  )

  expect(screen.getByText('妻：冷蔵庫の残り物')).toBeDefined()
  expect(screen.queryByText('夫：米を炊いたか')).toBeNull()
})

test('残り2つが結論を変えないなら、そこを聞かずに決着する', () => {
  render(
    <DinnerDecider
      initialFacts={{ riceCooked: null, hunger: 'now', leftovers: true, detour: null }}
    />,
  )

  expect(screen.getByText('結論')).toBeDefined()
  expect(screen.getByText('冷蔵庫の残り物で食べる')).toBeDefined()
  expect(
    screen.getByText(/米を炊いたかと寄り道して買えるかは、どちらでも結論が変わらないので聞きません。/),
  ).toBeDefined()
  expect(screen.queryByText('これを聞けば決まります')).toBeNull()
})

test('4つ揃うと結論と、誰が何をするかが出る', () => {
  const facts: Facts = { riceCooked: false, hunger: 'now', leftovers: true, detour: true }
  render(<DinnerDecider initialFacts={facts} />)

  expect(screen.getByText('結論')).toBeDefined()
  expect(screen.getByText('冷蔵庫の残り物で食べる')).toBeDefined()
  expect(screen.getByText('夫：買い物せずまっすぐ帰る')).toBeDefined()
  expect(screen.queryByText(/あと\d+つで決まります/)).toBeNull()
})

test('選択済みの回答は押された状態として公開される', () => {
  render(<DinnerDecider initialFacts={{ riceCooked: true, hunger: null, leftovers: null, detour: null }} />)

  expect(screen.getByRole('button', { name: '炊いた' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '炊いてない' }).getAttribute('aria-pressed')).toBe('false')
})
