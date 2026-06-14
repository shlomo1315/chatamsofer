'use client'
import { useMemo, useState } from 'react'
import { Coins } from 'lucide-react'
import type { MaternityAid } from '@/types'

type Period = 'day' | 'week' | 'month' | 'year' | 'all'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'היום' },
  { key: 'week', label: 'השבוע' },
  { key: 'month', label: 'החודש' },
  { key: 'year', label: 'השנה' },
  { key: 'all', label: 'הכל' },
]

const ils = (n: number) => `₪${n.toLocaleString('he-IL')}`

function periodStart(p: Period): number {
  if (p === 'all') return 0
  const now = new Date()
  if (p === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (p === 'week') { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() - ((d.getDay() + 7) % 7)); return d.getTime() }
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return new Date(now.getFullYear(), 0, 1).getTime() // year
}

// סיכום החיובים שבתי ההחלמה סימנו כבוצעו — לפי תקופה ולפי בית החלמה
export default function RecoveryBillingSummary({ aids }: { aids: MaternityAid[] }) {
  const [period, setPeriod] = useState<Period>('month')

  const { rows, totalAmount, totalNights, totalCount } = useMemo(() => {
    const since = periodStart(period)
    const byHome: Record<string, { amount: number; nights: number; count: number }> = {}
    let totalAmount = 0, totalNights = 0, totalCount = 0
    for (const a of aids) {
      if (a.recovery_amount == null) continue
      if (a.recovery_amount_status === 'rejected') continue
      const t = a.recovery_amount_at ? new Date(a.recovery_amount_at).getTime() : 0
      if (since && t < since) continue
      const home = a.recovery_home || '—'
      const e = byHome[home] ?? { amount: 0, nights: 0, count: 0 }
      e.amount += Number(a.recovery_amount) || 0
      e.nights += Number(a.recovery_nights) || 0
      e.count += 1
      byHome[home] = e
      totalAmount += Number(a.recovery_amount) || 0
      totalNights += Number(a.recovery_nights) || 0
      totalCount += 1
    }
    const rows = Object.entries(byHome).map(([home, v]) => ({ home, ...v })).sort((a, b) => b.amount - a.amount)
    return { rows, totalAmount, totalNights, totalCount }
  }, [aids, period])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Coins size={18} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-900">סיכום חיובי בתי החלמה</h2>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${period === p.key ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* סיכום כללי */}
      <div className="grid grid-cols-3 gap-3 p-4">
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">סה״כ חויב</p>
          <p className="text-xl font-bold text-emerald-700">{ils(totalAmount)}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">סה״כ לילות</p>
          <p className="text-xl font-bold text-indigo-700">{totalNights.toLocaleString('he-IL')}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">מספר יולדות</p>
          <p className="text-xl font-bold text-slate-700">{totalCount}</p>
        </div>
      </div>

      {/* פירוט לפי בית החלמה */}
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-400">אין חיובים בתקופה זו.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['בית החלמה', 'יולדות', 'לילות', 'סה״כ חויב'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.home} className="hover:bg-emerald-50/30">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.home}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.count}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.nights.toLocaleString('he-IL')}</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-700">{ils(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
