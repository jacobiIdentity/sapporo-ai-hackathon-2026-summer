import Anthropic from '@anthropic-ai/sdk'
import { clientKey, createLimiter, tooMany } from '@/lib/rate-limit'
import { normalizeIngredients } from '@/lib/receipt'

export const runtime = 'nodejs'

// 画像は文字より高く、撮り直しても数回で足りる。/api/parse より低く絞る。
const perClient = createLimiter({ limit: 4, windowMs: 60_000 })

const overall = createLimiter({ limit: 60, windowMs: 60 * 60_000, maxKeys: 1 })

/** Claudeが受け取る形式だけを通す。ここは信頼境界なので許可制にする。 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof ALLOWED)[number]

/** base64の長さ上限。実バイトでおよそ1.5MB。縮小に失敗した写真をここで止める。 */
const MAX_BASE64 = 2_000_000

const SYSTEM = `レシートの画像から、食べ物と食材だけを取り出します。

- 商品行を上から順に一つずつ見て、食品なら必ず入れます。飛ばさないでください。
- 一般的な短い名前にします。「北海道牛乳 1L」→「牛乳」、「豚こま切れ 300g」→「豚こま」
- レジ袋・割引・小計・合計・ポイント・店名・日付は入れません。
- 食品でないものは入れません。
- 読み取れないときは空の配列を返します。推測で足さないでください。`

const SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: { ingredients: { type: 'array', items: { type: 'string' } } },
    required: ['ingredients'],
    additionalProperties: false,
  },
} as const

/** デモ時にLLMを呼ばずに返す固定結果。画面の例と同じ並びにしてある。 */
const DEMO = ['牛乳', '卵', 'たまねぎ', '豚こま', '食パン']

export async function POST(req: Request) {
  const now = Date.now()
  const mine = perClient(clientKey(req), now)
  if (!mine.ok) return tooMany(mine.retryAfterSec)

  let data: string
  let mediaType: MediaType
  let demo = false
  try {
    const body = (await req.json()) as { data?: unknown; mediaType?: unknown; demo?: unknown }
    if (typeof body?.data !== 'string' || body.data === '') {
      return Response.json({ error: 'image required' }, { status: 400 })
    }
    if (!ALLOWED.includes(body.mediaType as MediaType)) {
      return Response.json({ error: 'unsupported media type' }, { status: 400 })
    }
    if (body.data.length > MAX_BASE64) {
      return Response.json({ error: 'image too large' }, { status: 413 })
    }
    data = body.data
    mediaType = body.mediaType as MediaType
    demo = body.demo === true
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  // URLに ?demo=1 が付いていればLLMを呼ばない。回線が不安な会場での保険。
  if (demo || process.env.NEXT_PUBLIC_DEMO_MODE === '1') {
    return Response.json({ ingredients: DEMO }, { status: 200 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }

  const budget = overall('all', now)
  if (!budget.ok) return tooMany(budget.retryAfterSec)

  try {
    const client = new Anthropic()
    // 決まった形を抜くだけの仕事なので Haiku。Opus 5 の5分の1（$1/$5 対 $5/$25）。
    // 実測は 0.45円/回、Opus 5 なら 2.2円/回。ただし Haiku は品目を落とすことがある。
    // Haiku 4.5 は effort 非対応（付けると400）なので、構造化出力で形だけ固定する。
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: SYSTEM,
      output_config: { format: SCHEMA },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'このレシートの食材を、上の行から順にすべて取り出してください。' },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'unavailable' }, { status: 503 })
    }

    const out = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return Response.json({ ingredients: normalizeIngredients(JSON.parse(out)) }, { status: 200 })
  } catch (error) {
    console.error('[receipt] failed:', error)
    // 読み取りは補助機能。失敗しても在庫は手で消せる。
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
}
