import sentences from './sentences.json'
import { keyOf, type Decision } from './decide'

type Decided = Extract<Decision, { status: 'decided' }>

/**
 * 結論に対応する「そのまま送れる一文」を返す。
 *
 * 一文は scripts/build-sentences.mjs で事前生成し、レビューしてコミットしてある。
 * 実行時にLLMは呼ばない。同じ結論なら常に同じ一文。
 *
 * 表にない結論（decide.ts の文言を変えたのに再生成し忘れた場合）は null を返し、
 * 画面は decision.reason を出す。テストが先に落ちるので本番までは届かない。
 */
export function sentenceFor(decision: Decided): string | null {
  return (sentences as Record<string, string>)[keyOf(decision)] ?? null
}
