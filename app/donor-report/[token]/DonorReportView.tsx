'use client'
import { useCallback, useEffect, useState } from 'react'
import { Lock, LogIn, Loader2 } from 'lucide-react'

// קו עיצובי זהה ללשונית כרטיסי המזון (app/yerid/dashboard/FoodCardsTab): פאנל פתיחה נייבי,
// סכום זהב, טבעת, פסים וגרף חודשים. הנתונים נטענים רק אחרי כניסה.
interface Report {
  label: string
  lockedHome: string | null
  homes: string[]
  summary: { count: number; amount: number; homes: { home: string; count: number; amount: number }[] }
  rows: { name: string; home: string; date: string; amount: number; note?: string | null }[]
}

const nis = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`
const heDate = (d: string) => (d ? d.split('-').reverse().join('.') : '—')
const PAGE_BG = 'min-h-screen bg-[#F4F1EA] text-[#14213D]'
const HOME_COLORS = ['#B8862B', '#14213D', '#5B74B8', '#2E8B57', '#C0392B', '#8A6A9E']
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return `${mo}/${y.slice(2)}` }

function Ring({ parts, total }: { parts: { color: string; value: number }[]; total: number }) {
  const R = 52
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg viewBox="0 0 140 140" className="h-44 w-44" role="img" aria-label="חלק כל בית החלמה ביולדות">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="16" />
      {total > 0 && parts.map((p, i) => {
        const len = (p.value / total) * C
        const el = (
          <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
        )
        acc += len
        return el
      })}
      <text x="70" y="68" textAnchor="middle" className="fill-[#F4F1EA] text-[26px] font-bold">{total.toLocaleString('he-IL')}</text>
      <text x="70" y="88" textAnchor="middle" className="fill-[#C9CFDB] text-[11px]">יולדות</text>
    </svg>
  )
}

function PasswordScreen({ token, onAuth }: { token: string; onAuth: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/donor-report/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, password }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'סיסמה שגויה') }
      else onAuth()
    } catch { setError('שגיאת תקשורת, נסו שוב') }
    finally { setLoading(false) }
  }

  return (
    <div className={`${PAGE_BG} flex items-center justify-center p-4`} dir="rtl">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl border border-[#E6E1D6] bg-white shadow-[0_1px_2px_rgba(20,33,61,.04)]">
          <div className="bg-[#14213D] px-8 py-9 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <Lock size={28} className="text-[#E7BE62]" />
            </div>
            <h1 className="text-xl font-bold text-[#F4F1EA]">דוח יולדות</h1>
            <p className="mt-1 text-sm text-[#C9CFDB]">שעל ידי היכל החתם סופר</p>
          </div>
          <form onSubmit={submit} className="px-8 py-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="donor-pw" className="text-sm font-medium text-[#5B6475]">סיסמת כניסה</label>
              <input id="donor-pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="הזינו סיסמה..." autoFocus autoComplete="current-password"
                className="w-full rounded-xl border border-[#E6E1D6] bg-[#F4F1EA] px-4 py-3 text-sm text-[#14213D] placeholder:text-[#7A8294] focus:outline-none focus:ring-2 focus:ring-[#B8862B]/50 focus:border-[#B8862B]" />
              {error && <p role="alert" className="text-xs text-[#C0392B] font-medium">{error}</p>}
            </div>
            <button type="submit" disabled={loading || !password}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#14213D] py-3 text-sm font-bold text-[#F4F1EA] hover:bg-[#0E182E] disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              כניסה
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main dir="rtl" className={`${PAGE_BG} flex items-center justify-center px-4`}>
      <div className="w-full max-w-md rounded-3xl border border-[#E6E1D6] bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-[#14213D]">{title}</h1>
        <p className="mt-3 text-sm text-[#5B6475]">{text}</p>
      </div>
    </main>
  )
}

export default function DonorReportView({ token }: { token: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [home, setHome] = useState('')
  const [data, setData] = useState<Report | null>(null)
  const [state, setState] = useState<'loading' | 'password' | 'inactive' | 'error' | 'ok'>('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ t: token })
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (home) qs.set('home', home)
    try {
      const res = await fetch(`/api/donor-report?${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) { setData(json); setState('ok') }
      else if (json.needsPassword) { setData(null); setState('password') }
      else if (json.inactive) { setData(null); setState('inactive') }
      else { setData(null); setError(json.error || 'שגיאה בטעינה'); setState('error') }
    } catch { setError('שגיאת רשת, נסו שוב'); setState('error') }
  }, [token, from, to, home])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  if (state === 'password') return <PasswordScreen token={token} onAuth={() => { setState('loading'); void load() }} />
  if (state === 'inactive') return <Notice title="הקישור טרם הופעל" text="פנו למשרד לקבלת סיסמה." />
  if (state === 'error') return <Notice title={error} text="אם הגעתם לכאן בטעות, פנו למשרד לקבלת קישור חדש." />
  if (!data) return <div className={`${PAGE_BG} flex items-center justify-center`} dir="rtl"><Loader2 className="animate-spin text-[#14213D]" /></div>

  const { summary, rows } = data
  const field = 'h-11 w-full rounded-xl border border-[#E6E1D6] bg-[#F4F1EA] px-3 text-sm text-[#14213D] focus:outline-none focus:ring-2 focus:ring-[#B8862B]/50 focus:border-[#B8862B]'
  const panel = 'rounded-3xl border border-[#E6E1D6] bg-white p-5 shadow-[0_1px_2px_rgba(20,33,61,.04)] sm:p-7'
  const colorOf = (i: number) => HOME_COLORS[i % HOME_COLORS.length]
  const maxHome = Math.max(1, ...summary.homes.map(h => h.amount))
  const months = new Map<string, { amount: number; count: number }>()
  for (const r of rows) {
    if (!r.date) continue
    const m = r.date.slice(0, 7)
    const cur = months.get(m) ?? { amount: 0, count: 0 }
    cur.amount += r.amount; cur.count++
    months.set(m, cur)
  }
  const byMonth = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }))
  const maxMonth = Math.max(1, ...byMonth.map(m => m.amount))
  const avg = summary.count ? summary.amount / summary.count : 0
  const topHome = summary.homes[0]

  return (
    <main dir="rtl" className={`${PAGE_BG} pb-12`}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-10">
        {/* ── פתיחה: הסכום הכולל + טבעת ── */}
        <section className="grid gap-6 rounded-3xl bg-[#14213D] p-6 text-[#F4F1EA] sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-[#C9CFDB]">{data.label}{data.lockedHome ? ` · ${data.lockedHome}` : ''}</p>
            <h1 className="mt-1 text-lg font-bold text-[#F4F1EA]">דוח יולדות</h1>
            <p className="mt-4 text-sm text-[#C9CFDB]">סך הכול הועבר לבתי ההחלמה</p>
            <p className="mt-1 text-5xl font-bold tabular-nums text-[#E7BE62] sm:text-6xl">{nis(summary.amount)}</p>
            <p className="mt-2 text-[15px] text-[#C9CFDB]">עבור {summary.count.toLocaleString('he-IL')} יולדות שאושרו</p>
            <dl className="mt-6 grid grid-cols-3 gap-3">
              {[
                ['יולדות', summary.count.toLocaleString('he-IL'), 'שאושרו'],
                ['ממוצע ליולדת', nis(avg), 'לפי הסכום שהועבר'],
                ['בתי החלמה', String(summary.homes.length), topHome ? `מוביל: ${topHome.home}` : '—'],
              ].map(([l, v, s]) => (
                <div key={l} className="rounded-2xl bg-white/8 px-3 py-3 sm:px-4">
                  <dt className="text-xs text-[#C9CFDB]">{l}</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{v}</dd>
                  <dd className="truncate text-[11px] text-[#9FA8BC]">{s}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mx-auto"><Ring total={summary.count} parts={summary.homes.map((h, i) => ({ color: colorOf(i), value: h.count }))} /></div>
        </section>

        {/* ── סינון ── */}
        <section className={`${panel} grid grid-cols-1 gap-4 sm:grid-cols-4`}>
          <label className="text-sm font-semibold text-[#5B6475]">מתאריך
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-semibold text-[#5B6475]">עד תאריך
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1`} />
          </label>
          {!data.lockedHome && (
            <label className="text-sm font-semibold text-[#5B6475] sm:col-span-2">בית החלמה
              <select value={home} onChange={e => setHome(e.target.value)} className={`${field} mt-1`}>
                <option value="">כל בתי ההחלמה</option>
                {data.homes.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          )}
        </section>

        {/* ── בתי החלמה ── */}
        {!data.lockedHome && summary.homes.length > 0 && (
          <section className={panel}>
            <h2 className="text-xl font-bold text-[#14213D]">לפי בית החלמה</h2>
            <p className="mt-1 text-sm text-[#5B6475]">הפס העליון מראה את חלק כל בית בסכום הכולל</p>
            <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-[#F1ECE0]" role="img" aria-label="חלק כל בית החלמה בסכום">
              {summary.homes.map((h, i) => (
                <span key={h.home} title={`${h.home}: ${nis(h.amount)}`} style={{ width: `${(h.amount / (summary.amount || 1)) * 100}%`, background: colorOf(i) }} />
              ))}
            </div>
            <ul className="mt-6 flex flex-col gap-5">
              {summary.homes.map((h, i) => (
                <li key={h.home}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="flex items-center gap-2 text-[17px] font-bold text-[#14213D]">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(i) }} />{h.home}
                    </span>
                    <span className="text-sm tabular-nums text-[#5B6475]">
                      {h.count.toLocaleString('he-IL')} יולדות · <b className="text-[#14213D]">{nis(h.amount)}</b>
                    </span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#F1ECE0]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, (h.amount / maxHome) * 100)}%`, background: colorOf(i) }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── חודשים ── */}
        <section className={panel}>
          <h2 className="text-xl font-bold text-[#14213D]">סכום לפי חודש</h2>
          {byMonth.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#5B6475]">אין נתונים בטווח שנבחר</p>
          ) : (
            <div className="mt-6 flex h-56 items-end gap-2 sm:gap-4">
              {byMonth.map(m => (
                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                  <span className="text-[11px] font-bold tabular-nums text-[#14213D] sm:text-sm">{nis(m.amount)}</span>
                  <div className="mx-auto mt-1 w-full max-w-14 rounded-t-lg bg-[#B8862B]" style={{ height: `${Math.max(4, (m.amount / maxMonth) * 78)}%` }} />
                  <span className="mt-2 text-xs text-[#5B6475]">{monthLabel(m.month)}</span>
                  <span className="text-[11px] text-[#7A8294]">{m.count} יולדות</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── פירוט ── */}
        <section className={panel}>
          <h2 className="text-xl font-bold text-[#14213D]">פירוט יולדות</h2>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#5B6475]">אין יולדות בטווח שנבחר</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#E6E1D6]">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#14213D]">{r.name}</p>
                    <p className="truncate text-sm text-[#5B6475]">{r.home}</p>
                  </div>
                  <div className={r.note ? 'max-w-[55%] text-left' : 'shrink-0 text-left'}>
                    {r.note
                      ? <p className="text-sm text-[#5B6475]">{r.note}</p>
                      : <p className="font-bold tabular-nums text-[#14213D]">{nis(r.amount)}</p>}
                    <p className="text-xs tabular-nums text-[#7A8294]">{heDate(r.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-[13px] text-[#5B6475]">היכל החתם סופר · מחלקת יולדות · הסכום לפי קבלות בית ההחלמה</p>
      </div>
    </main>
  )
}
