import Anthropic from '@anthropic-ai/sdk'
import { resolve, type Facts } from '@/lib/decide'

export const runtime = 'nodejs'

/**
 * ルールで出した結論を、そのまま相手に転送できる一文にする。
 * AIは言い換えだけを担当する。結論そのものはルールが決めるので、
 * APIが落ちても画面側は result.reason を出して動き続ける。
 */
export async function POST(req: Request) {
  let facts: Facts
  try {
    const body = (await req.json()) as { facts?: Facts }
    if (!body?.facts) return Response.json({ error: 'facts required' }, { status: 400 })
    facts = body.facts
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  // 4つ揃っていなくても、結論が確定していれば一文を作る。
  const decision = resolve(facts)
  if (decision.status !== 'decided') {
    return Response.json({ error: 'not decided yet' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ sentence: null }, { status: 200 })
  }

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 300,
      output_config: { effort: 'low' },
      system:
        '夫婦が夕食を決めるアプリです。決定は既に済んでいます。あなたは決定を、相手にそのまま送れる日本語の一文に言い換えるだけです。' +
        '新しい提案・条件・献立を足さないでください。です・ます調、60文字以内、絵文字なし、前置きなしで本文だけを返します。',
      messages: [
        {
          role: 'user',
          content: [
            `結論: ${decision.headline}`,
            `理由: ${decision.reason}`,
            `やること: ${decision.actions.join(' / ')}`,
            `米を炊いた: ${facts.riceCooked ? 'はい' : 'いいえ'}`,
            `空腹度: ${facts.hunger}`,
            `実家の残り物: ${facts.leftovers ? 'あり' : 'なし'}`,
            `寄り道: ${facts.detour ? 'できる' : 'できない'}`,
          ].join('\n'),
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json({ sentence: null }, { status: 200 })
    }

    const sentence = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return Response.json({ sentence: sentence || null }, { status: 200 })
  } catch (error) {
    console.error('[decide] Claude call failed:', error)
    // 画面はルールの結論を出し続けるので、ここは静かに諦めてよい。
    return Response.json({ sentence: null }, { status: 200 })
  }
}
