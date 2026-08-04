'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Gift, CalendarDays, Wallet, Users, ChevronLeft } from 'lucide-react'
import { Distribution } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'
const fmtCur = (n?: number) =>
  n != null
    // ⚠️ סמל השקל *אחרי* המספר: Intl עם style currency מציב אותו לפני, וזה
    // לא הצורה שקוראים בעברית ("500 ₪" ולא "₪500").
    ? `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`
    : '—'

export default function DistributionsClient({ distributions, counts = {} }: { distributions: Distribution[]; counts?: Record<string, number> }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return distributions
    return distributions.filter(d =>
      [d.name, d.year, d.holiday, d.description].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [distributions, query])

  const visible = useMemo(() =>
    applySortMode(filtered, sort,
      d => d.name ?? '',
      d => d.distribution_date ?? d.created_at,
    ), [filtered, sort])

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <SortButtons value={sort} onChange={setSort} />
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לפי שם, חג, תיאור…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-colors shadow-sm" />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Gift size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">{query ? 'לא נמצאו חלוקות לחיפוש זה' : 'לא נמצאו חלוקות'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map(d => {
            const registered = counts[d.id] ?? 0
            const expected = d.amount_per_family != null ? registered * Number(d.amount_per_family) : null
            return (
            <Link key={d.id} href={`/admin/distributions/${d.id}`} className="group">
              <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 cursor-pointer h-full flex flex-col">
                {/* פס עליון צבעוני לפי מצב הרישום */}
                <div className={`h-1 ${d.registration_open ? 'bg-gradient-to-l from-green-400 to-emerald-500' : 'bg-slate-200'}`} />
                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* כותרת + סטטוסים */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Gift size={20} className="text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                          <span className="truncate">{d.name}</span>
                          {d.year && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 flex-shrink-0">{d.year}</span>}
                        </h3>
                        {d.holiday && <p className="text-xs text-slate-500 mt-0.5">{d.holiday}</p>}
                      </div>
                    </div>
                    <ChevronLeft size={18} className="text-slate-300 group-hover:text-indigo-400 group-hover:-translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  </div>

                  {/* מונה נרשמים חי — בולט */}
                  <div className="flex items-stretch gap-3">
                    <div className={`flex-1 rounded-xl border p-3 ${registered > 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-1.5 text-indigo-600 mb-0.5">
                        <Users size={14} />
                        <span className="text-[11px] font-bold text-slate-500">נרשמו</span>
                      </div>
                      <p className={`text-2xl font-extrabold ltr-num ${registered > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                        {registered.toLocaleString('he-IL')}
                      </p>
                    </div>
                    {expected != null && (
                      <div className="flex-1 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                        <div className="flex items-center gap-1.5 text-emerald-600 mb-0.5">
                          <Wallet size={14} />
                          <span className="text-[11px] font-bold text-slate-500">צפי תקציבי</span>
                        </div>
                        <p className="text-2xl font-extrabold ltr-num text-emerald-700">{fmtCur(expected)}</p>
                      </div>
                    )}
                  </div>

                  {/* שורת מטא תחתונה */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mt-auto pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {d.registration_open
                        ? <span className="rounded-full bg-green-100 border border-green-300 px-2.5 py-0.5 text-[11px] font-extrabold text-green-800">🟢 פתוח לרישום</span>
                        : <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">סגור לרישום</span>}
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {d.amount_per_family != null && (
                        <span className="font-bold text-emerald-700">{Number(d.amount_per_family).toLocaleString('he-IL')} ₪ למשפחה</span>
                      )}
                      {d.distribution_date && (
                        <span className="flex items-center gap-1"><CalendarDays size={12} />{fmtDate(d.distribution_date)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
