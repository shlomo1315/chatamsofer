'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Gift, CalendarDays, Wallet } from 'lucide-react'
import { Distribution } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'
const fmtCur = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
    : '—'

export default function DistributionsClient({ distributions }: { distributions: Distribution[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return distributions
    return distributions.filter(d =>
      [d.name, d.holiday, d.description].filter(Boolean).join(' ').toLowerCase().includes(q)
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
        <div className="grid gap-4">
          {visible.map(d => (
            <Link key={d.id} href={`/admin/distributions/${d.id}`}>
              <div className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-5 cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Gift size={18} className="text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{d.name}</h3>
                      {d.holiday && <p className="text-xs text-slate-500 mt-0.5">{d.holiday}</p>}
                      {d.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{d.description}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <StatusBadge status={d.status} />
                    {d.total_budget != null && (
                      <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1">
                        <Wallet size={13} />{fmtCur(d.total_budget)}
                      </span>
                    )}
                    {d.distribution_date && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <CalendarDays size={12} />{fmtDate(d.distribution_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
