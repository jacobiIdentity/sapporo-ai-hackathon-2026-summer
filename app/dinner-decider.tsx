'use client'

import { useCallback, useEffect, useState } from 'react'
import { LABEL, OWNER, decide, type FactKey, type Facts } from '@/lib/decide'

const EMPTY: Facts = { riceCooked: null, hunger: null, leftovers: null, detour: null }

/** URLに全状態を載せる。LINEに貼れば相手の画面に自分の入力がそのまま出る。 */
function toQuery(f: Facts): string {
  const q = new URLSearchParams()
  if (f.riceCooked !== null) q.set('r', f.riceCooked ? '1' : '0')
  if (f.hunger !== null) q.set('h', f.hunger)
  if (f.leftovers !== null) q.set('l', f.leftovers ? '1' : '0')
  if (f.detour !== null) q.set('d', f.detour ? '1' : '0')
  return q.toString()
}

type AiResult = { key: string; text: string | null }

export default function DinnerDecider({ initialFacts = EMPTY }: { initialFacts?: Facts }) {
  const [facts, setFacts] = useState<Facts>(initialFacts)
  const [ai, setAi] = useState<AiResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [memo, setMemo] = useState('')
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState(false)

  const update = useCallback(<K extends FactKey>(key: K, value: Facts[K]) => {
    setFacts((prev) => {
      const next = { ...prev, [key]: value }
      window.history.replaceState(null, '', `?${toQuery(next)}`)
      return next
    })
  }, [])

  const result = decide(facts)
  const key = JSON.stringify(facts)
  const ready = ai?.key === key

  // 結論が変わるたびに一文を取り直す。取れるまでは result.reason を出しておく。
  useEffect(() => {
    const facts_ = JSON.parse(key) as Facts
    if (decide(facts_).status !== 'decided') return
    let alive = true
    fetch('/api/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facts: facts_ }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { sentence?: string | null }) => alive && setAi({ key, text: d.sentence ?? null }))
      .catch(() => alive && setAi({ key, text: null }))
    return () => {
      alive = false
    }
  }, [key])

  const read = async () => {
    setReading(true)
    setReadError(false)
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: memo,
          demo: new URLSearchParams(window.location.search).get('demo') === '1',
        }),
      })
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
      setReadError(true)
    } finally {
      setReading(false)
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

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <label htmlFor="memo" className="text-[15px] font-medium">
          思いついた順に書く
        </label>
        <textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          placeholder="実家におにぎり弁当残ってる、米炊き忘れた、凪まだ食べてない、イオン寄れる"
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
          {readError
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

      {result.status === 'waiting' ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm font-bold">あと{result.missing.length}つで決まります</p>
          <ul className="mt-2 flex flex-col gap-1">
            {result.missing.map((k) => (
              <li key={k} className="text-sm text-muted">
                {OWNER[k]}：{LABEL[k]}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-xl bg-success-soft p-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold tracking-widest text-muted">結論</p>
            <p className="text-2xl font-bold leading-tight">{result.headline}</p>
          </div>

          <div aria-live="polite" className="text-[15px]">
            {ready ? (
              <p>{ai?.text ?? result.reason}</p>
            ) : (
              <p className="text-muted">{result.reason}</p>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {result.actions.map((a) => (
              <li key={a} className="rounded-lg bg-surface px-4 py-3 text-[15px] font-medium">
                {a}
              </li>
            ))}
          </ul>

          {ready && ai?.text === null && (
            <p className="text-xs text-muted">
              通信できなかったので、手元の判断だけで結論を出しています。
            </p>
          )}
        </section>
      )}

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
