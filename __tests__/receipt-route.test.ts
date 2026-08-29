import { beforeEach, expect, test, vi } from 'vitest'

const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))

const { POST } = await import('@/app/api/receipt/route')

// 1x1 の実データである必要はない。長さと形式だけを見ている。
const IMAGE = 'AAAA'

function post(body: unknown, ip: string) {
  return POST(
    new Request('http://localhost/api/receipt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  create.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

test('JSONでない本文は400', async () => {
  const res = await POST(
    new Request('http://localhost/api/receipt', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.0.0.1' },
      body: 'not json',
    }),
  )
  expect(res.status).toBe(400)
  expect(create).not.toHaveBeenCalled()
})

test('画像がなければ400', async () => {
  const res = await post({ mediaType: 'image/jpeg' }, '1.0.0.2')
  expect(res.status).toBe(400)
  expect(create).not.toHaveBeenCalled()
})

test('許可していない形式は400。ここは信頼境界なので通さない', async () => {
  const res = await post({ data: IMAGE, mediaType: 'image/svg+xml' }, '1.0.0.3')
  expect(res.status).toBe(400)
  expect(create).not.toHaveBeenCalled()
})

test('大きすぎる画像は413。クライアントで縮小し損ねた場合の最後の砦', async () => {
  const res = await post({ data: 'A'.repeat(3_000_000), mediaType: 'image/jpeg' }, '1.0.0.4')
  expect(res.status).toBe(413)
  expect(create).not.toHaveBeenCalled()
})

test('demo指定ならLLMを呼ばずに固定の材料を返す', async () => {
  const res = await post({ data: IMAGE, mediaType: 'image/jpeg', demo: true }, '1.0.0.5')
  expect(res.status).toBe(200)
  expect((await res.json()).ingredients.length).toBeGreaterThan(0)
  expect(create).not.toHaveBeenCalled()
})

test('APIキーが無ければ503。読み取りは補助機能なので落として良い', async () => {
  delete process.env.ANTHROPIC_API_KEY
  const res = await post({ data: IMAGE, mediaType: 'image/jpeg' }, '1.0.0.6')
  expect(res.status).toBe(503)
  expect(create).not.toHaveBeenCalled()
})

test('Haikuに画像を渡し、読み取れた材料を返す', async () => {
  create.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"ingredients":["牛乳","卵","牛乳"]}' }],
  })

  const res = await post({ data: IMAGE, mediaType: 'image/png' }, '1.0.0.7')

  expect(res.status).toBe(200)
  // 重複は落ちる
  expect(await res.json()).toEqual({ ingredients: ['牛乳', '卵'] })

  const sent = create.mock.calls[0][0]
  expect(sent.model).toBe('claude-haiku-4-5')
  // Haiku 4.5 は effort 非対応。付けると400になる。
  expect(sent.output_config?.effort).toBeUndefined()
  expect(sent.messages[0].content[0]).toMatchObject({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: IMAGE },
  })
})

test('モデルが拒否したら503', async () => {
  create.mockResolvedValue({ stop_reason: 'refusal', content: [] })
  const res = await post({ data: IMAGE, mediaType: 'image/jpeg' }, '1.0.0.8')
  expect(res.status).toBe(503)
})

test('壊れた応答が返っても落ちずに503', async () => {
  create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ぐぬぬ' }] })
  const res = await post({ data: IMAGE, mediaType: 'image/jpeg' }, '1.0.0.9')
  expect(res.status).toBe(503)
})

test('食材が写っていなければ空配列を200で返す。これは失敗ではない', async () => {
  create.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"ingredients":[]}' }],
  })
  const res = await post({ data: IMAGE, mediaType: 'image/jpeg' }, '1.0.0.10')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ingredients: [] })
})

test('同じ相手が連打すると429を返す。画像は文字より高いので上限は低い', async () => {
  create.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"ingredients":["卵"]}' }],
  })

  const codes: number[] = []
  for (let i = 0; i < 6; i++) {
    codes.push((await post({ data: IMAGE, mediaType: 'image/jpeg' }, '9.9.9.9')).status)
  }

  expect(codes).toContain(429)
  expect(codes.filter((c) => c === 200).length).toBeLessThan(6)
})
