import { cleanNames } from './receipt'

/**
 * 家にあるもの。4項目と違って結論を直接は決めないが、
 * 「できている料理」を消すと `leftovers` に落ちるので、間接的に結論を動かす。
 */
export type Stock = { ingredients: string[]; dishes: string[] }

/** 登録機能ができるまでの初期値。ここから変わっていなければURLに載せない。 */
export const INITIAL_STOCK: Stock = {
  ingredients: ['卵', '玉ねぎ', '豚こま'],
  dishes: ['おにぎり弁当', 'ひじき煮', '味噌汁'],
}

type Param = string | string[] | undefined

const first = (v: Param): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

// 品目名にカンマは想定していない（LLMには短い一般名を返させている）。
// 混ざってもチップが2つに割れるだけで、手で消せる。
const split = (v: Param): string[] => cleanNames(first(v).split(','))

/**
 * 共有されたURLから在庫を読む。
 *
 * `i` も `k` も無ければ「共有されていない」＝初期値。
 * 片方でもあれば共有されたものと見なし、無い方は空にする。
 * 初期値に戻すと「全部消した」が「モックが3つある」にすり替わって結論が変わる。
 */
export function parseStock(params: Record<string, Param>): Stock {
  if (params.i === undefined && params.k === undefined) return INITIAL_STOCK
  return { ingredients: split(params.i), dishes: split(params.k) }
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, n) => v === b[n])

/**
 * URLに載せる形。初期値のままなら載せない（デモ用の短いURLを保つため）。
 *
 * 中身で比べる。参照では比べられない。Server Component から props で渡ると
 * シリアライズされて別オブジェクトになり、参照比較は常に「触られた」と誤判定する。
 */
export function stockQuery(stock: Stock): { i: string; k: string } | null {
  if (
    sameList(stock.ingredients, INITIAL_STOCK.ingredients) &&
    sameList(stock.dishes, INITIAL_STOCK.dishes)
  ) {
    return null
  }
  return { i: stock.ingredients.join(','), k: stock.dishes.join(',') }
}
