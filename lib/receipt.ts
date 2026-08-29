/**
 * レシート読み取り結果（LLM応答）を、画面に出せる材料名の配列に変換する。
 *
 * 読み取りは外すことがある（実測で3回に1回ほど品目を落とすか誤読する）。
 * だからここは「信じずに削る」側に倒す。捨てたものは画面に出ないだけで、
 * ユーザーは在庫のチップを手で消せるので、多く出るより少なく出る方が害が小さい。
 */

/** 材料名として長すぎるものは、品目ではなく文章を返してきたと見なす。 */
const MAX_NAME_LENGTH = 20

/** 画面は上位3つしか出さない。多く抱えても意味がないので上限を切る。 */
const MAX_ITEMS = 20

/**
 * 外から来た品目名の並びを、画面に出せる形に落とす。
 * 読み取り結果と、共有URLの両方がここを通る。どちらも他人が作れる入力。
 */
export function cleanNames(items: unknown): string[] {
  if (!Array.isArray(items)) return []

  const seen = new Set<string>()
  const out: string[] = []

  for (const item of items) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (name === '' || name.length > MAX_NAME_LENGTH || seen.has(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= MAX_ITEMS) break
  }

  return out
}

export function normalizeIngredients(raw: unknown): string[] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return cleanNames(o.ingredients)
}
