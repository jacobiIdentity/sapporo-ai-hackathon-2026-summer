/**
 * 結論ごとの「そのまま送れる一文」を事前生成して lib/sentences.json に固定する。
 *
 * 入力の組み合わせは24通り、結論は7通りしかない。実行時にLLMを呼ぶ理由がない。
 * ここで一度だけ生成し、人がレビューしてコミットする。以降は決定的。
 *
 *   node --experimental-strip-types scripts/build-sentences.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { decide, keyOf } from '../lib/decide.ts'

// .env.local を読む（このスクリプトはNext.jsの外で動くため）
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const VALUES = {
  riceCooked: [true, false],
  hunger: ['now', 'soon', 'later'],
  leftovers: [true, false],
  detour: [true, false],
}

const combos = []
for (const riceCooked of VALUES.riceCooked)
  for (const hunger of VALUES.hunger)
    for (const leftovers of VALUES.leftovers)
      for (const detour of VALUES.detour) combos.push({ riceCooked, hunger, leftovers, detour })

// 結論ごとに1件だけ残す
const byKey = new Map()
for (const facts of combos) {
  const d = decide(facts)
  if (d.status !== 'decided') continue
  if (!byKey.has(keyOf(d))) byKey.set(keyOf(d), { decision: d, facts })
}

console.log(`入力 ${combos.length}通り → 結論 ${byKey.size}通り。${byKey.size}回だけ生成します。`)

const client = new Anthropic()
const out = {}

for (const [key, { decision, facts }] of byKey) {
  const res = await client.messages.create({
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
          `冷蔵庫の残り物: ${facts.leftovers ? 'あり' : 'なし'}`,
          `寄り道: ${facts.detour ? 'できる' : 'できない'}`,
        ].join('\n'),
      },
    ],
  })

  if (res.stop_reason === 'refusal') throw new Error(`refused: ${decision.headline}`)
  const sentence = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  if (!sentence) throw new Error(`empty: ${decision.headline}`)

  out[key] = sentence
  console.log(`  ${decision.headline}\n    → ${sentence}`)
}

writeFileSync(
  new URL('../lib/sentences.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)
console.log(`\nlib/sentences.json に ${Object.keys(out).length}件を書き出しました。内容を読んでからコミットしてください。`)
