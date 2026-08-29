import DinnerDecider from './dinner-decider'
import type { Facts, Hunger } from '@/lib/decide'

/** 共有されたURLをそのまま初期状態にする。相手の入力が最初から入った状態で開く。 */
function fromParams(params: Record<string, string | string[] | undefined>): Facts {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const bool = (v: string | undefined) => (v === '1' ? true : v === '0' ? false : null)
  const h = one(params.h)
  return {
    riceCooked: bool(one(params.r)),
    hunger: h === 'now' || h === 'soon' || h === 'later' ? (h as Hunger) : null,
    leftovers: bool(one(params.l)),
    detour: bool(one(params.d)),
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <DinnerDecider initialFacts={fromParams(await searchParams)} />
}
