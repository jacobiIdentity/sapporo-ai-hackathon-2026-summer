'use client'

import { useCallback, useState } from 'react'
import { LABEL, OWNER, resolve, type FactKey, type Facts } from '@/lib/decide'
import { shrinkToDataUrl } from '@/lib/image'
import { sentenceFor } from '@/lib/sentence'

const EMPTY: Facts = { riceCooked: null, hunger: null, leftovers: null, detour: null }

const REPO = 'https://github.com/jacobiIdentity/sapporo-ai-hackathon-2026-summer'

/**
 * 不満の宛先を人ではなくルールにする。
 * 押すとGitHubのissue作成画面が、そのときの条件つきで開く。
 * サーバもトークンも要らない（GitHubの prefill URL を組み立てるだけ）。
 */
function issueUrl(facts: Facts, headline: string): string {
  const q = new URLSearchParams({
    title: `この結論は違った: ${headline}`,
    body: [
      '## そのときの条件',
      '',
      `- 米を炊いたか: ${facts.riceCooked === null ? '未回答' : facts.riceCooked ? '炊いた' : '炊いてない'}`,
      `- おなかの空き具合: ${facts.hunger ?? '未回答'}`,
      `- 冷蔵庫の残り物: ${facts.leftovers === null ? '未回答' : facts.leftovers ? 'ある' : 'ない'}`,
      `- 寄り道: ${facts.detour === null ? '未回答' : facts.detour ? '寄れる' : '寄れない'}`,
      '',
      `## 出た結論`,
      '',
      headline,
      '',
      '## 本当はどうしたかったか',
      '',
      '（ここに書く）',
    ].join('\n'),
  })
  return `${REPO}/issues/new?${q.toString()}`
}

/** URLに全状態を載せる。LINEに貼れば相手の画面に自分の入力がそのまま出る。 */
function toQuery(f: Facts): string {
  const q = new URLSearchParams()
  if (f.riceCooked !== null) q.set('r', f.riceCooked ? '1' : '0')
  if (f.hunger !== null) q.set('h', f.hunger)
  if (f.leftovers !== null) q.set('l', f.leftovers ? '1' : '0')
  if (f.detour !== null) q.set('d', f.detour ? '1' : '0')
  return q.toString()
}

export default function DinnerDecider({ initialFacts = EMPTY }: { initialFacts?: Facts }) {
  const [facts, setFacts] = useState<Facts>(initialFacts)
  const [copied, setCopied] = useState(false)
  // 在庫はモック。登録機能ができるまでは手で消せるだけ。
  const [stock, setStock] = useState({
    ingredients: ['卵', '玉ねぎ', '豚こま'],
    dishes: ['おにぎり弁当', 'ひじき煮', '味噌汁'],
  })
  const [memo, setMemo] = useState('')
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<'none' | 'failed' | 'busy'>('none')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<'none' | 'failed' | 'busy' | 'empty'>('none')

  const update = useCallback(<K extends FactKey>(key: K, value: Facts[K]) => {
    setFacts((prev) => {
      const next = { ...prev, [key]: value }
      window.history.replaceState(null, '', `?${toQuery(next)}`)
      return next
    })
  }, [])

  const result = resolve(facts)

  const read = async () => {
    setReading(true)
    setReadError('none')
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: memo,
          demo: new URLSearchParams(window.location.search).get('demo') === '1',
        }),
      })
      if (res.status === 429) {
        setReadError('busy')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const { facts: parsed } = (await res.json()) as { facts: Facts }
      // 読み取れた項目だけ上書きする。null はトグルを未選択のまま残す。
      setFacts((prev) => {
        const next: Facts = {
          riceCooked: parsed.riceCooked ?? prev.riceCooked,
          hunger: parsed.hunger ?? prev.hunger,
          leftovers: parsed.leftovers ?? prev.leftovers,
          detour: parsed.detour ?? prev.detour,
        }
        window.history.replaceState(null, '', `?${toQuery(next)}`)
        return next
      })
    } catch {
      setReadError('failed')
    } finally {
      setReading(false)
    }
  }

  /**
   * レシートの写真から材料を入れ替える。
   *
   * 埋まるのは材料だけで、冷蔵庫の残り物には触らない。
   * レシートは買ったものしか写しておらず、何を作って何が残っているかを知らないため。
   * 読み取りは外すことがあるので、結果はチップの×で1つずつ消せるままにしてある。
   */
  const scan = async (file: File) => {
    setScanning(true)
    setScanError('none')
    try {
      const image = await shrinkToDataUrl(file)
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...image,
          demo: new URLSearchParams(window.location.search).get('demo') === '1',
        }),
      })
      if (res.status === 429) {
        setScanError('busy')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const { ingredients } = (await res.json()) as { ingredients: string[] }
      // 読み取れなかっただけなので、いまある在庫は消さない。
      if (ingredients.length === 0) {
        setScanError('empty')
        return
      }
      setStock((p) => ({ ...p, ingredients }))
    } catch {
      setScanError('failed')
    } finally {
      setScanning(false)
    }
  }

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">今日の夕食</h1>
        <p className="text-sm text-muted">
          4つ埋まると結論が出ます。埋めたらこの画面のURLを相手に送ってください。
        </p>
      </header>


      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold">いま家にあるもの</h2>
          <span className="inline-flex h-5 items-center rounded-full bg-sunken px-2 text-[10px] font-bold tracking-widest text-faint">
            MOCK
          </span>
        </div>

        <StockRow
          label="材料"
          items={stock.ingredients}
          onRemove={(name) =>
            setStock((p) => ({ ...p, ingredients: p.ingredients.filter((i) => i !== name) }))
          }
        />
        <StockRow
          label="できている料理"
          items={stock.dishes}
          onRemove={(name) => {
            const dishes = stock.dishes.filter((i) => i !== name)
            setStock((p) => ({ ...p, dishes }))
            // 在庫を触った瞬間だけ回答に落とす。初期表示では埋めない（URLの状態を上書きしないため）。
            // 以後もトグルは自由に押し直せる。
            update('leftovers', dishes.length > 0)
          }}
        />

        <label
          htmlFor="receipt"
          className="inline-flex h-11 items-center justify-center self-start rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-medium"
        >
          レシートを撮る
        </label>
        <input
          id="receipt"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={scanning}
          onChange={(e) => {
            const file = e.target.files?.[0]
            // 同じ写真をもう一度選べるようにする。
            e.target.value = ''
            if (file) scan(file)
          }}
          className="sr-only"
        />
        <p aria-live="polite" className="text-xs text-muted">
          {scanning
            ? '読み取っています…'
            : scanError === 'busy'
              ? '読み取りの回数制限に達しました。少し待つか、そのまま手で消してください。'
              : scanError === 'failed'
                ? '読み取れませんでした。材料は手で消せます。'
                : scanError === 'empty'
                  ? '食材が見つかりませんでした。撮り直すか、手で消してください。'
                  : 'レシートを撮ると材料が入れ替わります。違っていたら×で消せます。'}
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <label htmlFor="memo" className="text-[15px] font-medium">
          思いついた順に書く
        </label>
        <textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          placeholder="冷蔵庫におにぎり弁当残ってる、米炊き忘れた、長女まだ食べてない、イオン寄れる"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] placeholder:text-faint"
        />
        <button
          type="button"
          onClick={read}
          disabled={reading || memo.trim() === ''}
          className="h-11 rounded-lg border border-line-strong bg-surface px-4 font-medium disabled:text-faint"
        >
          {reading ? '読み取っています…' : '読み取る'}
        </button>
        <p aria-live="polite" className="text-xs text-muted">
          {readError === 'busy'
            ? '読み取りの回数制限に達しました。少し待つか、下から選んでください。'
            : readError === 'failed'
              ? '読み取れませんでした。下から選んでください。'
              : '読み取った内容は下のトグルに入ります。違っていたら押し直してください。'}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <Card owner={OWNER.riceCooked} label={LABEL.riceCooked} answered={facts.riceCooked !== null}>
          <Choice selected={facts.riceCooked === true} onClick={() => update('riceCooked', true)}>
            炊いた
          </Choice>
          <Choice selected={facts.riceCooked === false} onClick={() => update('riceCooked', false)}>
            炊いてない
          </Choice>
        </Card>

        <Card owner={OWNER.hunger} label={LABEL.hunger} answered={facts.hunger !== null}>
          <Choice selected={facts.hunger === 'now'} onClick={() => update('hunger', 'now')}>
            もう限界
          </Choice>
          <Choice selected={facts.hunger === 'soon'} onClick={() => update('hunger', 'soon')}>
            あと30分
          </Choice>
          <Choice selected={facts.hunger === 'later'} onClick={() => update('hunger', 'later')}>
            まだ平気
          </Choice>
        </Card>

        <Card owner={OWNER.leftovers} label={LABEL.leftovers} answered={facts.leftovers !== null}>
          <Choice selected={facts.leftovers === true} onClick={() => update('leftovers', true)}>
            ある
          </Choice>
          <Choice selected={facts.leftovers === false} onClick={() => update('leftovers', false)}>
            ない
          </Choice>
        </Card>

        <Card owner={OWNER.detour} label={LABEL.detour} answered={facts.detour !== null}>
          <Choice selected={facts.detour === true} onClick={() => update('detour', true)}>
            寄れる
          </Choice>
          <Choice selected={facts.detour === false} onClick={() => update('detour', false)}>
            寄れない
          </Choice>
        </Card>
      </section>

      {result.status === 'asking' ? (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
          <p className="text-xs font-bold tracking-widest text-muted">これを聞けば決まります</p>
          <p className="text-xl font-bold leading-tight">
            {`${OWNER[result.ask]}：${LABEL[result.ask]}`}
          </p>
          <p className="text-sm text-muted">
            いまの候補は{result.candidates.length}通り。
            {result.known.length > 0 && `${result.known.length}つ分かっています。`}
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-xl bg-success-soft p-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold tracking-widest text-muted">結論</p>
            <p className="text-2xl font-bold leading-tight">{result.headline}</p>
          </div>

          <div aria-live="polite" className="text-[15px]">
            <p>{sentenceFor(result) ?? result.reason}</p>
          </div>

          {result.skipped.length > 0 && (
            <p className="text-sm font-medium text-muted">
              {`${result.skipped.map((k) => LABEL[k]).join('と')}は、どちらでも結論が変わらないので聞きません。`}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {result.actions.map((a) => (
              <li key={a} className="rounded-lg bg-surface px-4 py-3 text-[15px] font-medium">
                {a}
              </li>
            ))}
          </ul>

          <a
            href={issueUrl(facts, result.headline)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center self-start rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-foreground"
          >
            この結論は違った
          </a>
        </section>
      )}


      <section
        aria-labelledby="next-title"
        className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-sunken p-5 text-muted"
      >
        <div className="flex items-center gap-2">
          <h2 id="next-title" className="text-[15px] font-bold text-muted">
            次にやること
          </h2>
          <span className="inline-flex h-5 items-center rounded-full bg-surface px-2 text-[10px] font-bold tracking-widest text-faint">
            NOT TODAY
          </span>
        </div>

        <p className="text-sm">買ったものを登録すると、上の3つが自動で埋まります。</p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            className="h-11 rounded-lg border border-dashed border-line-strong bg-surface px-4 text-[15px] font-medium text-faint"
          >
            レシートを撮る
          </button>
          <button
            type="button"
            disabled
            className="h-11 rounded-lg border border-dashed border-line-strong bg-surface px-4 text-[15px] font-medium text-faint"
          >
            話して入力
          </button>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <p className="text-xs tracking-widest text-faint">例</p>
          <p className="rounded-lg bg-surface px-3 py-2">牛乳、卵、玉ねぎ、豚こま、食パン</p>
          <p aria-hidden="true" className="text-center text-faint">↓</p>
          <dl className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-2">
              <dt>材料がある</dt>
              <dd className="font-medium">自動</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-2">
              <dt>できている料理</dt>
              <dd className="font-medium">なし</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-2">
              <dt>ごはんが炊けている</dt>
              <dd className="font-medium">炊飯器の状態は別途</dd>
            </div>
          </dl>
        </div>

        <hr className="border-0 border-t border-dashed border-line-strong" />

        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-bold text-muted">17:00に先回りする</p>
          <p className="text-sm">
            空腹になる前に「今日はこれで決まりそうです」を出せば、交渉そのものが起きません。
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
              <span>通知する時刻</span>
              <span className="font-medium tabular-nums">17:00</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
              <span>曜日</span>
              <span className="font-medium">平日のみ</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
              <span>受け取る人</span>
              <span className="font-medium">夫・妻</span>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="h-11 rounded-lg border border-dashed border-line-strong bg-surface px-4 text-[15px] font-medium text-faint"
          >
            通知をオンにする
          </button>

          <p className="text-xs">
            iOSのWeb Pushはホーム画面への追加が必要です。今日はiPhoneのショートカットで
            17:00にこの画面を開いて代用しています。
          </p>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={share}
          className="h-11 flex-1 rounded-lg bg-accent px-4 font-medium text-white"
        >
          {copied ? 'コピーしました' : 'このURLをコピー'}
        </button>
        <button
          type="button"
          onClick={() => {
            setFacts(EMPTY)
            window.history.replaceState(null, '', window.location.pathname)
          }}
          className="h-11 rounded-lg border border-line-strong bg-surface px-4 font-medium"
        >
          リセット
        </button>
      </div>
    </main>
  )
}

function StockRow({
  label,
  items,
  onRemove,
}: {
  label: string
  items: string[]
  onRemove: (name: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-faint">{`${label}（上位3つ）`}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">なくなりました</p>
      ) : (
        <ul className="-mr-4 flex flex-nowrap gap-2 overflow-x-auto pr-4">
          {items.slice(0, 3).map((name) => (
            <li
              key={name}
              className="inline-flex h-9 flex-none items-center gap-1 rounded-full bg-sunken pl-3 pr-1 text-sm"
            >
              <span className="whitespace-nowrap">{name}</span>
              <button
                type="button"
                onClick={() => onRemove(name)}
                aria-label={`${name}を消す`}
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-faint"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l8 8M11 3l-8 8" />
                </svg>
              </button>
            </li>
          ))}
          {/* 上位3つだけ出している。続きがあることだけ示す。 */}
          <li
            aria-hidden="true"
            className="inline-flex h-9 flex-none items-center px-2 text-sm text-faint"
          >
            …
          </li>
        </ul>
      )}
    </div>
  )
}

function Card({
  owner,
  label,
  answered,
  children,
}: {
  owner: string
  label: string
  answered: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 items-center rounded-full px-3 text-xs font-medium ${
            answered ? 'bg-accent-soft text-accent' : 'bg-sunken text-muted'
          }`}
        >
          {owner}
        </span>
        <span className="text-[15px] font-medium">{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-11 rounded-lg border px-4 text-[15px] font-medium ${
        selected
          ? 'border-accent bg-accent text-white'
          : 'border-line-strong bg-surface text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
