import Anthropic from '@anthropic-ai/sdk'
import { normalizeParsed, type Facts } from '@/lib/decide'
import { createLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// 1人あたりの連打制限。読み取りは書き直しても数回で足りる。
const perClient = createLimiter({ limit: 8, windowMs: 60_000 })

// 全体の上限。API課金を守るための最後の砦で、1人が回線を変えても効く。
const overall = createLimiter({ limit: 120, windowMs: 60 * 60_000, maxKeys: 1 })

/** Vercelは x-forwarded-for に実クライアントIPを入れる。無ければ全員同じ枠に入る。 */
function clientKey(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || 'unknown'
}

function tooMany(retryAfterSec: number) {
  return Response.json(
    { error: 'rate_limited', retryAfterSec },
    { status: 429, headers: { 'retry-after': String(retryAfterSec) } },
  )
}

const SYSTEM = `夫婦の夕食メモから、4項目だけを読み取ってJSONで返します。

r: 米を炊いたか。炊いてある=1 / 炊き忘れ・炊いてない=0
h: 家族の空腹度。もう限界="now" / あと30分くらい="30" / まだ平気="ok"
   「まだ食べていない」「おなかすいた」「ぐずってる」は "now" と読みます。
l: 冷蔵庫の残り物や作り置きがあるか。ある=1 / ない=0
d: 帰りに店へ寄れるか。寄れる=1 / 寄れない=0

書かれていない項目、判断できない項目は必ず null にします。推測で埋めないでください。
出力はJSONオブジェクトのみ。説明や前置きを書かないでください。
例: {"r":0,"h":"now","l":1,"d":1}`

/** デモ時にLLMを呼ばずに返す固定結果。例文と同じ4項目が揃う。 */
const DEMO: Facts = { riceCooked: false, hunger: 'now', leftovers: true, detour: true }

export async function POST(req: Request) {
  const now = Date.now()
  const mine = perClient(clientKey(req), now)
  if (!mine.ok) return tooMany(mine.retryAfterSec)

  let text: string
  let demo = false
  try {
    const body = (await req.json()) as { text?: unknown; demo?: unknown }
    if (typeof body?.text !== 'string' || body.text.trim() === '') {
      return Response.json({ error: 'text required' }, { status: 400 })
    }
    text = body.text.slice(0, 2000)
    demo = body.demo === true
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  // URLに ?demo=1 が付いていればLLMを呼ばない。回線が不安な会場での保険。
  if (demo || process.env.NEXT_PUBLIC_DEMO_MODE === '1') {
    return Response.json({ facts: DEMO }, { status: 200 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }

  const budget = overall('all', now)
  if (!budget.ok) return tooMany(budget.retryAfterSec)

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 200,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'unavailable' }, { status: 503 })
    }

    const out = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // 前後に説明が付いても拾えるように、最初のJSONオブジェクトだけ取り出す。
    const match = out.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'unparsable' }, { status: 503 })

    return Response.json({ facts: normalizeParsed(JSON.parse(match[0])) }, { status: 200 })
  } catch (error) {
    console.error('[parse] failed:', error)
    // 読み取りは補助機能。失敗しても手動トグルで操作できる。
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
}
