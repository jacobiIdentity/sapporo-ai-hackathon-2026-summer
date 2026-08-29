import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import DinnerDecider from '@/app/dinner-decider'
import type { Facts } from '@/lib/decide'

// canvas と Image は jsdom に無い。縮小はブラウザAPIそのものなので、ここでは外す。
vi.mock('@/lib/image', () => ({
  shrinkToDataUrl: vi.fn(async () => ({ data: 'AAAA', mediaType: 'image/jpeg' })),
}))

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

test('結論に納得できないとき、条件つきでルールへ異議を出せる', () => {
  render(
    <DinnerDecider
      initialFacts={{ riceCooked: false, hunger: 'now', leftovers: true, detour: true }}
    />,
  )

  const link = screen.getByRole('link', { name: 'この結論は違った' })
  const href = decodeURIComponent(link.getAttribute('href') ?? '')

  // 宛先はルール（リポジトリ）であって、相手ではない
  expect(href).toContain('/issues/new')
  // そのときの条件が最初から入っている＝あとで再現できる
  expect(href).toContain('冷蔵庫の残り物で食べる')
  expect(href).toContain('炊いてない')
  expect(href).toContain('ある')
})

test('家にあるものは材料・料理とも3つずつ出て、×で消える', () => {
  render(<DinnerDecider />)

  expect(screen.getByText('材料（上位3つ）')).toBeDefined()
  expect(screen.getByText('できている料理（上位3つ）')).toBeDefined()
  expect(screen.getByText('おにぎり弁当')).toBeDefined()

  fireEvent.click(screen.getByRole('button', { name: 'おにぎり弁当を消す' }))

  expect(screen.queryByText('おにぎり弁当')).toBeNull()
  // 他の項目は残る
  expect(screen.getByText('ひじき煮')).toBeDefined()
})

test('全部消すと「なくなりました」になる', () => {
  render(<DinnerDecider />)

  for (const name of ['卵', '玉ねぎ', '豚こま']) {
    fireEvent.click(screen.getByRole('button', { name: `${name}を消す` }))
  }

  expect(screen.getByText('なくなりました')).toBeDefined()
})

test('できている料理を全部消すと、冷蔵庫の残り物が「ない」に変わる', () => {
  render(<DinnerDecider initialFacts={{ riceCooked: true, hunger: 'now', leftovers: null, detour: false }} />)

  for (const name of ['おにぎり弁当', 'ひじき煮', '味噌汁']) {
    fireEvent.click(screen.getByLabelText(`${name}を消す`))
  }

  expect(screen.getByRole('button', { name: 'ない' }).getAttribute('aria-pressed')).toBe('true')
})

test('料理が1つでも残っていれば、冷蔵庫の残り物は「ある」になる', () => {
  render(<DinnerDecider />)

  fireEvent.click(screen.getByLabelText('ひじき煮を消す'))

  expect(screen.getByRole('button', { name: 'ある' }).getAttribute('aria-pressed')).toBe('true')
})

test('材料を消しても冷蔵庫の残り物の回答は変わらない', () => {
  render(<DinnerDecider />)

  fireEvent.click(screen.getByLabelText('卵を消す'))

  expect(screen.getByRole('button', { name: 'ある' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: 'ない' }).getAttribute('aria-pressed')).toBe('false')
})

test('在庫が空でも、手でトグルし直せる', () => {
  render(<DinnerDecider />)

  for (const name of ['おにぎり弁当', 'ひじき煮', '味噌汁']) {
    fireEvent.click(screen.getByLabelText(`${name}を消す`))
  }
  fireEvent.click(screen.getByRole('button', { name: 'ある' }))

  expect(screen.getByRole('button', { name: 'ある' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'ない' }).getAttribute('aria-pressed')).toBe('false')
})

test('初期表示では、在庫があっても冷蔵庫の残り物は未回答のまま', () => {
  render(<DinnerDecider />)

  expect(screen.getByRole('button', { name: 'ある' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: 'ない' }).getAttribute('aria-pressed')).toBe('false')
})

const RECEIPT = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

/** fetch を1回分の応答に差し替え、呼ばれた宛先を記録して返す。 */
function stubFetch(status: number, body: unknown): string[] {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }),
  )
  return urls
}

function pickReceipt() {
  fireEvent.change(screen.getByLabelText('レシートを撮る'), { target: { files: [RECEIPT] } })
}

test('レシートを読み取ると、材料が読み取った中身に入れ替わる', async () => {
  const urls = stubFetch(200, { ingredients: ['牛乳', 'ヨーグルト', 'にんじん'] })
  render(<DinnerDecider />)

  pickReceipt()

  await waitFor(() => expect(screen.getByText('牛乳')).toBeDefined())
  expect(screen.getByText('にんじん')).toBeDefined()
  // 元のモックは残らない
  expect(screen.queryByText('玉ねぎ')).toBeNull()
  expect(urls).toEqual(['/api/receipt'])
})

test('材料は上位3つまで出す。読み取れた数が多くても画面は増えない', async () => {
  stubFetch(200, { ingredients: ['牛乳', '卵', 'たまねぎ', '豚こま', '食パン'] })
  render(<DinnerDecider />)

  pickReceipt()

  await waitFor(() => expect(screen.getByText('たまねぎ')).toBeDefined())
  expect(screen.getByText('牛乳')).toBeDefined()
  expect(screen.queryByText('食パン')).toBeNull()
  expect(screen.queryByText('豚こま')).toBeNull()
})

test('レシートを読んでも冷蔵庫の残り物の回答は変えない。レシートは残り物を知らないため', async () => {
  stubFetch(200, { ingredients: ['牛乳', '卵'] })
  render(<DinnerDecider />)

  pickReceipt()

  await waitFor(() => expect(screen.getByText('牛乳')).toBeDefined())
  expect(screen.getByRole('button', { name: 'ある' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: 'ない' }).getAttribute('aria-pressed')).toBe('false')
})

test('食材が見つからなければ、その旨を出して在庫は触らない', async () => {
  stubFetch(200, { ingredients: [] })
  render(<DinnerDecider />)

  pickReceipt()

  await waitFor(() => expect(screen.getByText(/食材が見つかりませんでした/)).toBeDefined())
  // 読み取れなかっただけなので、元の在庫は消さない
  expect(screen.getByText('玉ねぎ')).toBeDefined()
})

test('読み取りに失敗したら、手で消せることを伝える', async () => {
  stubFetch(503, {})
  render(<DinnerDecider />)

  pickReceipt()

  await waitFor(() => expect(screen.getByText(/読み取れませんでした/)).toBeDefined())
  expect(screen.getByText('玉ねぎ')).toBeDefined()
})

test('回数制限に当たったら、その旨を出す', async () => {
  stubFetch(429, {})
  render(<DinnerDecider />)

  pickReceipt()

  await waitFor(() => expect(screen.getByText(/回数制限/)).toBeDefined())
})
