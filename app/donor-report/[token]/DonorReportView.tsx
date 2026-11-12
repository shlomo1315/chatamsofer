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
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ t: token })
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (home) qs.set('home', home)
    try {
      const res = await fetch(`/api/donor-report?${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'שגיאה בטעינה'); setData(null) } else { setError(''); setData(json) }
    } catch { setError('שגיאת רשת, נסו שוב') }
    setLoading(false)
  }, [token, from, to, home])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  const field = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-[#1B3256] focus:outline-none'

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
