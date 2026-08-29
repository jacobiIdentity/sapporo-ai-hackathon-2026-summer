import { describe, expect, test } from 'vitest'
import { INITIAL_STOCK, parseStock, stockQuery } from './stock'

describe('parseStock', () => {
  test('パラメータが無ければ初期のモックを返す', () => {
    expect(parseStock({})).toEqual(INITIAL_STOCK)
  })

  test('共有されたURLの中身をそのまま在庫にする', () => {
    expect(parseStock({ i: '牛乳,卵', k: 'ひじき煮' })).toEqual({
      ingredients: ['牛乳', '卵'],
      dishes: ['ひじき煮'],
    })
  })

  test('空文字は空の在庫。「全部消した」が相手に伝わる', () => {
    expect(parseStock({ i: '', k: '' })).toEqual({ ingredients: [], dishes: [] })
  })

  test('片方だけでも共有と見なす。無い方は初期値に戻さず空にする', () => {
    expect(parseStock({ i: '牛乳' })).toEqual({ ingredients: ['牛乳'], dishes: [] })
    expect(parseStock({ k: '味噌汁' })).toEqual({ ingredients: [], dishes: ['味噌汁'] })
  })

  test('前後の空白と空の要素は落とす', () => {
    expect(parseStock({ i: ' 牛乳 ,,  , 卵', k: '' }).ingredients).toEqual(['牛乳', '卵'])
  })

  test('重複は先に出た方だけ残す', () => {
    expect(parseStock({ i: '卵,牛乳,卵', k: '' }).ingredients).toEqual(['卵', '牛乳'])
  })

  test('長すぎる名前は捨てる。URLは誰でも書けるため', () => {
    const long = 'あ'.repeat(21)
    expect(parseStock({ i: `牛乳,${long}`, k: '' }).ingredients).toEqual(['牛乳'])
  })

  test('件数は20件で打ち切る', () => {
    const many = Array.from({ length: 50 }, (_, n) => `品目${n}`).join(',')
    expect(parseStock({ i: many, k: '' }).ingredients).toHaveLength(20)
  })

  test('同じキーが複数あれば最初の1つだけ見る', () => {
    expect(parseStock({ i: ['牛乳', '卵'], k: '' }).ingredients).toEqual(['牛乳'])
  })
})

describe('stockQuery', () => {
  test('初期のモックのままならURLに載せない。デモ用の短いURLを保つため', () => {
    expect(stockQuery(INITIAL_STOCK)).toBeNull()
  })

  test('サーバから渡って別オブジェクトになっても、中身が初期値なら載せない', () => {
    // Server Component の props はシリアライズされる。参照は保たれない。
    expect(stockQuery(structuredClone(INITIAL_STOCK))).toBeNull()
  })

  test('触られていれば材料と料理の両方を載せる', () => {
    expect(stockQuery({ ingredients: ['牛乳'], dishes: ['味噌汁'] })).toEqual({
      i: '牛乳',
      k: '味噌汁',
    })
  })

  test('空でも載せる。「無い」ことが伝わらないと結論が変わる', () => {
    expect(stockQuery({ ingredients: [], dishes: [] })).toEqual({ i: '', k: '' })
  })

  test('載せたものは、そのまま読み戻せる', () => {
    const stock = { ingredients: ['牛乳', 'たまねぎ'], dishes: ['おにぎり弁当'] }
    expect(parseStock(stockQuery(stock)!)).toEqual(stock)
  })
})
