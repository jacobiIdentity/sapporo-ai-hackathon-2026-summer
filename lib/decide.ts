/**
 * 平日19時台の「今日の夕食どうする」を1回で終わらせるための判断ロジック。
 *
 * 往復が長引く原因は判断材料が3人に散っていること。
 * 4つ揃うまでは結論を出さず、揃った瞬間に1つの結論だけを返す。
 */

export type Hunger = 'now' | 'soon' | 'later'

export type Facts = {
  /** 米を炊いたか（夫が持っている情報） */
  riceCooked: boolean | null
  /** 妻と子の空腹度（妻が持っている情報） */
  hunger: Hunger | null
  /** 実家の残り物があるか（妻が持っている情報。昨日は20通目で出てきた決定打） */
  leftovers: boolean | null
  /** 夫が寄り道して買えるか（夫が持っている情報） */
  detour: boolean | null
}

export type FactKey = keyof Facts

export type Plan = 'leftovers' | 'home' | 'buy' | 'delivery'

export type Decision =
  | { status: 'waiting'; missing: FactKey[] }
  | { status: 'decided'; plan: Plan; headline: string; reason: string; actions: string[] }

/** 誰が持っている情報か。UIの「◯◯待ち」表示に使う。 */
export const OWNER: Record<FactKey, string> = {
  riceCooked: '夫',
  hunger: '妻',
  leftovers: '妻',
  detour: '夫',
}

export const LABEL: Record<FactKey, string> = {
  riceCooked: '米を炊いたか',
  hunger: 'おなかの空き具合',
  leftovers: '実家の残り物',
  detour: '寄り道して買えるか',
}

const ORDER: FactKey[] = ['riceCooked', 'hunger', 'leftovers', 'detour']

export function decide(facts: Facts): Decision {
  const missing = ORDER.filter((k) => facts[k] === null)
  if (missing.length > 0) return { status: 'waiting', missing }

  const { riceCooked, hunger, leftovers, detour } = facts as {
    riceCooked: boolean
    hunger: Hunger
    leftovers: boolean
    detour: boolean
  }
  const urgent = hunger === 'now'

  // 1. 残り物は「今すぐ出せる」ので、急いでいるときは何より速い。
  if (leftovers && (urgent || !riceCooked)) {
    return {
      status: 'decided',
      plan: 'leftovers',
      headline: '実家の残り物で食べる',
      reason: urgent
        ? 'すぐ食べたい状態で、いま出せるものが家にあるため。'
        : '米が炊けていないので、いま出せるものを使うのが速いため。',
      actions: ['妻：残り物を出す', '夫：買い物せずまっすぐ帰る'],
    }
  }

  // 2. 米が炊けていれば主食は解決済み。急ぎでなければ買い足しも要らない。
  if (riceCooked) {
    return urgent || !detour
      ? {
          status: 'decided',
          plan: 'home',
          headline: '家のごはんで食べる',
          reason: '米が炊けているので、主食はもう用意できているため。',
          actions: ['妻：ごはんと在庫のおかずを出す', '夫：まっすぐ帰る'],
        }
      : {
          status: 'decided',
          plan: 'home',
          headline: '家のごはん＋おかずを1品だけ買う',
          reason: '米は炊けているので、足りないのはおかずだけのため。',
          actions: ['夫：おかずを1品だけ買って帰る', '妻：ごはんを用意して待つ'],
        }
  }

  // 3. 米なし。夫が寄り道できるなら買って帰るのが確実。
  if (detour) {
    return {
      status: 'decided',
      plan: 'buy',
      headline: '夫が買って帰る',
      reason: '米が炊けておらず家に出せるものがないため、買うのが一番早いため。',
      actions: [
        urgent ? '夫：すぐ食べられるものを買って帰る' : '夫：夕食一式を買って帰る',
        '妻：配膳の準備だけしておく',
      ],
    }
  }

  // 4. 米なし・残り物なし・寄り道もできない。作るより届く方が速い。
  return {
    status: 'decided',
    plan: 'delivery',
    headline: '出前をとる',
    reason: '家に出せるものがなく、夫も買い物に寄れないため。',
    actions: ['妻：出前を注文する', '夫：まっすぐ帰る'],
  }
}

/**
 * 自由文の読み取り結果（LLM応答）を Facts に変換する。
 *
 * 読み取れなかった項目は null のまま残す＝トグルは未選択のままなので、
 * 読み取りが外れても手で選び直せる。decide() の判断ルールには関与しない。
 */
export function normalizeParsed(raw: unknown): Facts {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  const bool = (v: unknown): boolean | null =>
    v === 1 || v === true ? true : v === 0 || v === false ? false : null

  const hunger = (v: unknown): Hunger | null =>
    v === 'now' ? 'now'
    : v === '30' || v === 'soon' ? 'soon'
    : v === 'ok' || v === 'later' ? 'later'
    : null

  return {
    riceCooked: bool(o.r),
    hunger: hunger(o.h),
    leftovers: bool(o.l),
    detour: bool(o.d),
  }
}

const VALUES: { [K in FactKey]: NonNullable<Facts[K]>[] } = {
  riceCooked: [true, false],
  hunger: ['now', 'soon', 'later'],
  leftovers: [true, false],
  detour: [true, false],
}

/** 未知の項目にあり得る値を全部入れた場合の Facts を列挙する。最大 2*3*2*2 = 24 通り。 */
function completions(facts: Facts): Facts[] {
  const unknown = ORDER.filter((k) => facts[k] === null)
  return unknown.reduce<Facts[]>(
    (acc, k) => acc.flatMap((f) => VALUES[k].map((v) => ({ ...f, [k]: v }) as Facts)),
    [facts],
  )
}

function plansOf(facts: Facts): Plan[] {
  const seen = new Set<Plan>()
  for (const f of completions(facts)) {
    const d = decide(f)
    if (d.status === 'decided') seen.add(d.plan)
  }
  return [...seen]
}

export type Resolution =
  | {
      status: 'decided'
      plan: Plan
      headline: string
      reason: string
      actions: string[]
      /** 結論が変わらないので聞かずに済んだ項目。20往復のうち何往復が不要だったか。 */
      skipped: FactKey[]
    }
  | {
      status: 'asking'
      /** これが分かれば一番速く決まる、という1項目。 */
      ask: FactKey
      /** いま残っている結論の候補。 */
      candidates: Plan[]
      known: FactKey[]
    }

/**
 * 4つ全部を待たずに決める。
 *
 * 20往復の原因は「何を聞けば終わるのか誰も知らない」こと。
 * だから未知の項目を全展開して、
 *   - 結論が1つに収束していれば、残りを聞かずに出す
 *   - まだ割れていれば、候補を一番減らせる1項目だけを名指しする
 * decide() の判断ルールには手を入れていない。ここはその上に乗る問い合わせ層。
 */
export function resolve(facts: Facts): Resolution {
  const candidates = plansOf(facts)
  const unknown = ORDER.filter((k) => facts[k] === null)

  if (candidates.length === 1) {
    // どの組み合わせでも結論が同じ。代表の1つから文言を取る。
    const d = decide(completions(facts)[0])
    if (d.status !== 'decided') throw new Error('unreachable')
    return { ...d, skipped: unknown }
  }

  // 各未知項目について、その値が判明したときに残る候補数を数える。
  // 最悪ケースが小さい順、並んだら「一発で終わらせられる可能性がある方」を先に聞く。
  // 昨日でいえば、残り物の有無は当たれば即決するので米より先に聞くべきだった。
  let ask = unknown[0]
  let bestScore: [number, number] = [Infinity, Infinity]
  for (const k of unknown) {
    const sizes = VALUES[k].map((v) => plansOf({ ...facts, [k]: v } as Facts).length)
    const score: [number, number] = [Math.max(...sizes), Math.min(...sizes)]
    if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
      bestScore = score
      ask = k
    }
  }

  return {
    status: 'asking',
    ask,
    candidates,
    known: ORDER.filter((k) => facts[k] !== null),
  }
}
