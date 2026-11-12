'use client'
import { useCallback, useEffect, useState } from 'react'

interface Report {
  label: string
  lockedHome: string | null
  homes: string[]
  summary: { count: number; amount: number; homes: { home: string; count: number; amount: number }[] }
  rows: { name: string; home: string; date: string; amount: number }[]
}

const nis = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`
const heDate = (d: string) => (d ? d.split('-').reverse().join('.') : '—')

export default function DonorReportView({ token }: { token: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [home, setHome] = useState('')
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('') // הסיסמה שהוזנה בשדה
  const [secret, setSecret] = useState('') // הסיסמה שאומתה, נשמרת בזיכרון בלבד
  const [authError, setAuthError] = useState('')

  const load = useCallback(async (pw: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/donor-report', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, password: pw, from, to, home }),
      })
      const json = await res.json()
      if (res.status === 401 || res.status === 429) { setSecret(''); setData(null); setAuthError(json.error || 'שגיאה'); }
      else if (!res.ok) { setError(json.error || 'שגיאה בטעינה'); setData(null) }
      else { setError(''); setAuthError(''); setSecret(pw); setData(json) }
    } catch { setAuthError('שגיאת רשת, נסו שוב') }
    setLoading(false)
  }, [token, from, to, home])

  // לאחר הכניסה, שינוי מסנן טוען מחדש עם הסיסמה שאומתה.
  useEffect(() => {
    if (!secret) return
    const t = setTimeout(() => { void load(secret) }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, home])

  const field = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-[#1B3256] focus:outline-none'

  if (!secret && !(error && !data)) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <form onSubmit={e => { e.preventDefault(); if (password) void load(password) }}
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-xl font-bold text-[#1B3256]">מעקב אשראי</h1>
          <p className="mt-2 text-sm text-slate-600">להצגת הנתונים יש להזין את הסיסמה שנמסרה לכם.</p>
          <label className="mt-5 block text-sm font-medium text-slate-700">סיסמה
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" className={`${field} mt-1`} />
          </label>
          {authError && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{authError}</p>}
          <button type="submit" disabled={loading || !password} className="mt-5 h-11 w-full rounded-xl bg-[#1B3256] text-sm font-bold text-white disabled:opacity-50">{loading ? 'בודק…' : 'כניסה'}</button>
        </form>
      </main>
    )
  }

  if (error && !data) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-[#1B3256]">{error}</h1>
          <p className="mt-3 text-sm text-slate-600">אם הגעתם לכאן בטעות, פנו למשרד לקבלת קישור חדש.</p>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-[#1B3256]">מעקב אשראי – יולדות שאושרו</h1>
          {data && <p className="mt-1 text-sm text-slate-600">{data.label}{data.lockedHome ? ` · ${data.lockedHome}` : ''}</p>}
        </header>

        <section className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">מתאריך
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-medium text-slate-700">עד תאריך
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1`} />
          </label>
          {!data?.lockedHome && (
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">בית החלמה
              <select value={home} onChange={e => setHome(e.target.value)} className={`${field} mt-1`}>
                <option value="">כל בתי ההחלמה</option>
                {data?.homes.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          )}
        </section>

        {data && (
          <>
            <section className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-sm text-slate-600">מספר יולדות</div>
                <div className="mt-1 text-3xl font-bold text-[#1B3256]">{data.summary.count}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-sm text-slate-600">סכום כולל</div>
                <div className="mt-1 text-3xl font-bold text-[#1B3256]">{nis(data.summary.amount)}</div>
              </div>
            </section>

            {!data.lockedHome && data.summary.homes.length > 1 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-slate-800">פילוח לפי בית החלמה</h2>
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.summary.homes.map(h => (
                    <li key={h.home} className="flex items-center justify-between py-2">
                      <span className="text-slate-800">{h.home}</span>
                      <span className="text-slate-600">{h.count} יולדות · <b className="text-slate-800">{nis(h.amount)}</b></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={`rounded-2xl border border-slate-200 bg-white ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr><th className="px-2 py-3 sm:px-4">שם היולדת</th><th className="px-2 py-3 sm:px-4">בית החלמה</th><th className="px-2 py-3 sm:px-4">תאריך</th><th className="px-2 py-3 sm:px-4">סכום</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-3 sm:px-4 text-slate-800">{r.name}</td>
                      <td className="px-2 py-3 sm:px-4 text-slate-600">{r.home}</td>
                      <td className="px-2 py-3 sm:px-4 text-slate-600">{heDate(r.date)}</td>
                      <td className="px-2 py-3 sm:px-4 font-medium text-slate-800">{nis(r.amount)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">אין יולדות בטווח שנבחר</td></tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
