'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Eye, Search, Layers } from 'lucide-react'
import { LoanStatusControl, DeleteLoanButton } from './LoanControls'
import type { Loan } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'
// סמל השקל משמאל למספר
const fmtCur = (n: number) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`

type BenRef = { full_name?: string; family_name?: string; id_number?: string; spouse_name?: string; spouse_id_number?: string }
// שם הלווה — שם הבעל (full_name); אם אין בעל, שם האישה (spouse_name)
const borrowerName = (b?: BenRef) =>
  b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'

type Filter = 'all' | 'pending' | 'approved' | 'rejected'
const isApproved = (l: Loan) => l.status === 'approved' || l.status === 'active' || l.status === 'completed'
const isRejected = (l: Loan) => l.status === 'rejected' || l.status === 'defaulted'
const matchesFilter = (l: Loan, f: Filter) => {
  if (f === 'all') return true
  if (f === 'pending') return l.status === 'pending'
  if (f === 'approved') return isApproved(l)
  return isRejected(l)
}

interface CardDef { key: Filter; label: string; icon: typeof Clock; base: string; active: string; iconCls: string }
const CARD_DEFS: CardDef[] = [
  { key: 'all', label: 'הכל', icon: Layers, base: 'border-slate-200 hover:border-slate-300', active: 'border-slate-400 ring-2 ring-slate-200 bg-slate-50', iconCls: 'bg-slate-100 text-slate-600' },
  { key: 'pending', label: 'ממתינות לאישור', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
  { key: 'approved', label: 'מאושרות', icon: Check, base: 'border-green-200 hover:border-green-300', active: 'border-green-400 ring-2 ring-green-200 bg-green-50', iconCls: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: 'לא מאושרות', icon: X, base: 'border-red-200 hover:border-red-300', active: 'border-red-400 ring-2 ring-red-200 bg-red-50', iconCls: 'bg-red-100 text-red-700' },
]

const haystack = (l: Loan) => {
  const b = l.beneficiary as BenRef | undefined
  return [borrowerName(b), b?.id_number, b?.spouse_id_number, l.purpose, fmtCur(l.amount), String(l.installments)]
    .filter(Boolean).join(' ').toLowerCase()
}

export default function LoansTable({ data }: { data: Loan[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => ({
    all: data.length,
    pending: data.filter(l => l.status === 'pending').length,
    approved: data.filter(isApproved).length,
    rejected: data.filter(isRejected).length,
  }), [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(l => matchesFilter(l, filter) && (q === '' || haystack(l).includes(q)))
  }, [data, filter, query])

  return (
    <div className="flex flex-col gap-5">
      {/* Filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CARD_DEFS.map(c => {
          const Icon = c.icon
          const isActive = filter === c.key
          return (
            <button key={c.key}
              onClick={() => setFilter(isActive && c.key !== 'all' ? 'all' : c.key)}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3.5 text-right transition-all ${isActive ? c.active : c.base}`}>
              <span className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${c.iconCls}`}>
                <Icon size={18} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{counts[c.key]}</span>
                <span className="text-xs text-slate-500 mt-1 truncate">{c.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700">רשימת הלוואות</h2>
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש חופשי…"
              className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-colors" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="bg-gradient-to-b from-slate-50 to-slate-100/60 border-b border-slate-200">
                {['שם הלווה', 'ת.ז.', 'סכום מבוקש', 'סכום מאושר', 'תשלומים', 'מטרה', 'תאריך הגשה', 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap align-middle text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">לא נמצאו הלוואות בסינון זה</td></tr>
              ) : filtered.map(loan => {
                const b = loan.beneficiary as BenRef | undefined
                return (
                  <tr key={loan.id}
                    onClick={() => router.push(`/admin/loans/${loan.id}`)}
                    className="even:bg-slate-50/50 hover:bg-indigo-50/50 transition-colors cursor-pointer">
                    <td className="px-4 py-3.5 align-middle text-right font-medium text-slate-800 whitespace-nowrap">{borrowerName(b)}</td>
                    <td className="px-4 py-3.5 align-middle text-right text-xs font-mono text-slate-500"><span className="ltr-num">{b?.id_number ?? '—'}</span></td>
                    <td className="px-4 py-3.5 align-middle text-right font-semibold text-slate-900"><span className="ltr-num">{fmtCur(loan.amount)}</span></td>
                    <td className="px-4 py-3.5 align-middle text-right">
                      {loan.approved_amount != null
                        ? <span className="ltr-num font-semibold text-green-700">{fmtCur(loan.approved_amount)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-middle text-right text-slate-600">{loan.installments}</td>
                    <td className="px-4 py-3.5 align-middle text-right text-slate-600 max-w-[140px] truncate">{loan.purpose ?? '—'}</td>
                    <td className="px-4 py-3.5 align-middle text-right text-slate-500 text-xs"><span className="ltr-num">{fmtDate(loan.created_at)}</span></td>
                    <td className="px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}><LoanStatusControl loan={loan} /></td>
                    <td className="px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/loans/${loan.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                          <Eye size={14} /> צפייה
                        </Link>
                        <DeleteLoanButton loanId={loan.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
