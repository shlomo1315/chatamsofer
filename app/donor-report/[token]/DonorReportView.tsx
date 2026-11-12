'use client'
import { useCallback, useEffect, useState } from 'react'
import { Lock, LogIn, Loader2, Baby, Wallet, Home, CalendarDays } from 'lucide-react'
import { BRAND } from '@/app/shared/distributions/brand'

// קו עיצובי זהה לדפי הצפייה המשותפים (app/shared/distributions): זהב המותג,
// מסך כניסה בסיסמה, כרטיסי סיכום וטבלה. הנתונים נטענים רק אחרי כניסה.
interface Report {
  label: string
  lockedHome: string | null
  homes: string[]
  summary: { count: number; amount: number; homes: { home: string; count: number; amount: number }[] }
  rows: { name: string; home: string; date: string; amount: number }[]
}

const nis = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`
const heDate = (d: string) => (d ? d.split('-').reverse().join('.') : '—')
const PAGE_BG = 'bg-gradient-to-br from-[#faf7f0] via-[#f5efe0] to-[#ece0c4]'

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
    <div className={`min-h-screen ${PAGE_BG} flex items-center justify-center p-4`} dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: BRAND.sand, boxShadow: '0 24px 60px -30px rgba(138,106,36,0.55)' }}>
          <div className="relative overflow-hidden px-8 py-9 text-center"
            style={{ background: `linear-gradient(160deg, ${BRAND.goldDeep}, ${BRAND.gold} 60%, #9a7a2e)` }}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/25 ring-1 ring-white/30 mb-4">
              <Lock size={28} className="text-white" />
            </div>
            <h1 className="relative text-xl font-extrabold text-white">מעקב אשראי</h1>
            <p className="relative text-sm mt-1 text-white/75">שעל ידי היכל החתם סופר</p>
          </div>
          <form onSubmit={submit} className="px-8 py-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="donor-pw" className="text-sm font-medium text-slate-700">סיסמת כניסה</label>
              <input id="donor-pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="הזינו סיסמה..." autoFocus autoComplete="current-password"
                className="w-full rounded-xl border border-[#e8dfc9] bg-[#faf7f0] px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/60 focus:border-[#b08d3f]" />
              {error && <p role="alert" className="text-xs text-red-600 font-medium">{error}</p>}
            </div>
            <button type="submit" disabled={loading || !password}
              className="flex items-center justify-center gap-2 rounded-xl text-white font-bold py-3 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(90deg, ${BRAND.goldDeep}, ${BRAND.gold})`, boxShadow: '0 10px 24px -14px rgba(138,106,36,0.9)' }}>
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
    <main dir="rtl" className={`min-h-screen ${PAGE_BG} flex items-center justify-center px-4`}>
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center" style={{ borderColor: BRAND.sand }}>
        <h1 className="text-xl font-bold" style={{ color: BRAND.goldDeep }}>{title}</h1>
        <p className="mt-3 text-sm" style={{ color: BRAND.inkSoft }}>{text}</p>
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
  if (!data) return <div className={`min-h-screen ${PAGE_BG} flex items-center justify-center`} dir="rtl"><Loader2 className="animate-spin" style={{ color: BRAND.gold }} /></div>

  const field = 'h-11 w-full rounded-xl border border-[#e8dfc9] bg-[#faf7f0] px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/60 focus:border-[#b08d3f]'
  const card = 'rounded-2xl border bg-white'
  const stat = (icon: React.ReactNode, label: string, value: string) => (
    <div className={`${card} p-5`} style={{ borderColor: BRAND.sand }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: BRAND.inkSoft }}>{icon}{label}</div>
      <div className="mt-2 text-3xl font-extrabold" style={{ color: BRAND.goldDeep }}>{value}</div>
    </div>
  )

  return (
    <main dir="rtl" className={`min-h-screen ${PAGE_BG} pb-10`}>
      <header className="px-4 py-8 text-center" style={{ background: `linear-gradient(160deg, ${BRAND.goldDeep}, ${BRAND.gold} 60%, #9a7a2e)` }}>
        <h1 className="text-2xl font-extrabold text-white">מעקב אשראי – יולדות שאושרו</h1>
        <p className="mt-1 text-sm text-white/80">{data.label}{data.lockedHome ? ` · ${data.lockedHome}` : ''}</p>
      </header>

      <div className="mx-auto mt-6 w-full max-w-4xl space-y-6 px-4">
        <section className={`${card} grid grid-cols-1 gap-4 p-5 sm:grid-cols-4`} style={{ borderColor: BRAND.sand }}>
          <label className="text-sm font-medium text-slate-700">מתאריך
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-medium text-slate-700">עד תאריך
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1`} />
          </label>
          {!data.lockedHome && (
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">בית החלמה
              <select value={home} onChange={e => setHome(e.target.value)} className={`${field} mt-1`}>
                <option value="">כל בתי ההחלמה</option>
                {data.homes.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className="grid grid-cols-2 gap-4">
          {stat(<Baby size={16} />, 'מספר יולדות', String(data.summary.count))}
          {stat(<Wallet size={16} />, 'סכום כולל', nis(data.summary.amount))}
        </section>

        {!data.lockedHome && data.summary.homes.length > 1 && (
          <section className={`${card} p-5`} style={{ borderColor: BRAND.sand }}>
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold" style={{ color: BRAND.ink }}><Home size={16} style={{ color: BRAND.gold }} />פילוח לפי בית החלמה</h2>
            <ul className="divide-y divide-[#e8dfc9] text-sm">
              {data.summary.homes.map(h => (
                <li key={h.home} className="flex items-center justify-between py-2">
                  <span className="text-slate-800">{h.home}</span>
                  <span style={{ color: BRAND.inkSoft }}>{h.count} יולדות · <b className="text-slate-800">{nis(h.amount)}</b></span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`${card} overflow-hidden`} style={{ borderColor: BRAND.sand }}>
          <table className="w-full table-fixed text-right text-sm">
            <thead style={{ background: BRAND.cream, color: BRAND.inkSoft }}>
              <tr>
                <th className="px-2 py-3 sm:px-4">שם היולדת</th><th className="px-2 py-3 sm:px-4">בית החלמה</th>
                <th className="px-2 py-3 sm:px-4"><CalendarDays size={14} className="inline ml-1" />תאריך</th><th className="px-2 py-3 sm:px-4">סכום</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8dfc9]">
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-3 sm:px-4 text-slate-800">{r.name}</td>
                  <td className="px-2 py-3 sm:px-4" style={{ color: BRAND.inkSoft }}>{r.home}</td>
                  <td className="px-2 py-3 sm:px-4" style={{ color: BRAND.inkSoft }}>{heDate(r.date)}</td>
                  <td className="px-2 py-3 sm:px-4 font-medium text-slate-800">{nis(r.amount)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">אין יולדות בטווח שנבחר</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
