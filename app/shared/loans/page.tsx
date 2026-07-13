'use client'
import { useState, useEffect, useCallback } from 'react'
import { Lock, LogIn, LogOut, CreditCard, CheckCircle2, Clock3, Loader2, Calendar, User, RefreshCw, Download } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────
interface PortalLoan {
  id: string
  amount: number
  approved_amount?: number | null
  installments: number
  monthly_payment: number
  purpose?: string
  purpose_details?: string
  notes?: string
  created_at: string
  disbursed_at?: string | null
  disbursed_by?: string | null
  beneficiary?: {
    full_name?: string
    family_name?: string
    id_number?: string
    address?: string
    city?: string
    phone?: string
    email?: string
  } | null
}

const fmtCur = (n: number) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`
const fmtDate = (d?: string | null) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const borrowerName = (b?: PortalLoan['beneficiary']) =>
  b ? ([b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'

// בפורטל מציגים את הסכום שאושר בפועל (נפילה לסכום המבוקש אם לא הוזן)
const shownAmount = (l: PortalLoan) => Number(l.approved_amount ?? l.amount) || 0

// ── Password Screen ───────────────────────────────────────────────────────────
function PasswordScreen({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/shared/loans/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'סיסמה שגויה')
      } else {
        onAuth()
      }
    } catch {
      setError('שגיאת תקשורת, נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          <div className="bg-gradient-to-l from-indigo-600 to-violet-600 px-8 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
              <Lock size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">פורטל הלוואות</h1>
            <p className="text-indigo-200 text-sm mt-1">היכל החתם סופר</p>
          </div>

          <form onSubmit={submit} className="px-8 py-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">סיסמת כניסה</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="הזן סיסמה..."
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-shadow"
              />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white font-semibold py-3 text-sm shadow-md shadow-indigo-200 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              כניסה
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Disburse Modal ────────────────────────────────────────────────────────────
function DisburseModal({ loan, onClose, onDone }: {
  loan: PortalLoan
  onClose: () => void
  onDone: (loanId: string, disbursedAt: string, disbursedBy: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/shared/loans/${loan.id}/disburse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disbursed_at: date, disbursed_by: name }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'שגיאה')
      } else {
        onDone(loan.id, date, name)
        onClose()
      }
    } catch {
      setError('שגיאת תקשורת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-500 to-teal-500 px-6 py-5">
          <h2 className="text-white font-bold text-lg">סימון ביצוע הלוואה</h2>
          <p className="text-emerald-100 text-sm mt-0.5">{borrowerName(loan.beneficiary)} — {fmtCur(shownAmount(loan))}</p>
        </div>

        <form onSubmit={submit} className="px-6 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-400" />
              תאריך ביצוע
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={today}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-shadow"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <User size={14} className="text-slate-400" />
              שם המבצע <span className="text-slate-400 font-normal text-xs">(אופציונלי)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="שם האחראי על הביצוע..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-shadow"
            />
          </div>

          {error && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 mt-1">
            <button
              type="submit"
              disabled={loading || !date}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-semibold py-2.5 text-sm shadow-md shadow-emerald-200 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              אשר ביצוע
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type FilterMode = 'all' | 'pending' | 'done'

// ── Portal Screen ─────────────────────────────────────────────────────────────
function PortalScreen({ onLogout }: { onLogout: () => void }) {
  const [loans, setLoans] = useState<PortalLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState<PortalLoan | null>(null)
  const [filter, setFilter] = useState<FilterMode>('pending')

  const loadLoans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shared/loans')
      if (res.ok) {
        const d = await res.json()
        setLoans(d.loans ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadLoans() }, [loadLoans])

  const handleDone = (loanId: string, disbursedAt: string, disbursedBy: string) => {
    setLoans(prev => prev.map(l =>
      l.id === loanId ? { ...l, disbursed_at: disbursedAt, disbursed_by: disbursedBy } : l,
    ))
  }

  const pending = loans.filter(l => !l.disbursed_at)
  const done = loans.filter(l => !!l.disbursed_at)
  const visibleLoans = filter === 'pending' ? pending : filter === 'done' ? done : loans

  const filterLabel: Record<FilterMode, string> = {
    all: 'כל ההלוואות',
    pending: 'ממתינות לביצוע',
    done: 'בוצעו',
  }

  // ייצוא ההלוואות המסוננות לקובץ אקסל (CSV עם BOM — נפתח ישירות באקסל בעברית)
  const exportExcel = () => {
    const headers = ['שם משפחה', 'שם פרטי', 'ת.ז.', 'רחוב', 'עיר', 'טלפון', 'מייל', 'סכום מאושר', 'מספר תשלומים', 'סטטוס', 'תאריך ביצוע']
    const rows = visibleLoans.map(l => [
      l.beneficiary?.family_name ?? '',
      l.beneficiary?.full_name ?? '',
      l.beneficiary?.id_number ?? '',
      l.beneficiary?.city ?? '',
      l.beneficiary?.phone ? `="${l.beneficiary.phone}"` : '',
      l.beneficiary?.email ?? '',
      shownAmount(l),
      l.installments ?? '',
      l.disbursed_at ? 'בוצעה' : 'ממתינה לביצוע',
      fmtDate(l.disbursed_at),
    ])
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const csv = '﻿' + [headers, ...rows].map(row => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `הלוואות-${filterLabel[filter]}-${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const statCards: { key: FilterMode; label: string; value: number; numCls: string; dotCls: string; activeCls: string }[] = [
    { key: 'pending', label: 'ממתינות לביצוע', value: pending.length, numCls: 'text-amber-600', dotCls: 'bg-amber-400', activeCls: 'bg-amber-50 border-amber-300 ring-2 ring-amber-200' },
    { key: 'all', label: 'סה״כ הלוואות', value: loans.length, numCls: 'text-indigo-600', dotCls: 'bg-indigo-400', activeCls: 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' },
    { key: 'done', label: 'בוצעו', value: done.length, numCls: 'text-emerald-600', dotCls: 'bg-emerald-400', activeCls: 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <CreditCard size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">פורטל הלוואות</h1>
              <p className="text-xs text-slate-500">היכל החתם סופר</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLoans}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              רענן
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-xs text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              <LogOut size={13} />
              התנתקות
            </button>
          </div>
        </div>
      </header>

      {/* max-w-7xl (1280px) — 8 עמודות צריכות מקום. ממורכז, עם רווח בצדדים. */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Filter Cards */}
        <div className="grid grid-cols-3 gap-3">
          {statCards.map(s => {
            const isActive = filter === s.key
            return (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={`rounded-2xl border p-4 text-center transition-all cursor-pointer ${
                  isActive
                    ? `${s.activeCls} shadow-sm`
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.dotCls} ${isActive ? '' : 'opacity-60'}`} />
                  <p className={`text-2xl font-bold tabular-nums ${s.numCls}`}>{s.value}</p>
                </div>
                <p className={`text-xs mt-1.5 font-medium ${isActive ? 'text-slate-700' : 'text-slate-500'}`}>{s.label}</p>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">טוען הלוואות...</p>
          </div>
        ) : (
          <>
            {visibleLoans.length > 0 ? (
              <section>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    {filter === 'pending' && <Clock3 size={15} className="text-amber-500" />}
                    {filter === 'done' && <CheckCircle2 size={15} className="text-emerald-500" />}
                    {filter === 'all' && <CreditCard size={15} className="text-slate-400" />}
                    {filterLabel[filter]} ({visibleLoans.length})
                  </h2>
                  <button
                    onClick={exportExcel}
                    title="הורד את הרשימה המסוננת כקובץ אקסל"
                    className="flex items-center gap-2 text-sm font-bold text-white bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 rounded-xl px-5 py-2.5 shadow-[0_6px_16px_-6px_rgba(5,150,105,0.6)] hover:shadow-[0_10px_22px_-8px_rgba(5,150,105,0.7)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
                  >
                    <Download size={17} />
                    הורד אקסל
                  </button>
                </div>
                {/* min-w נמוך מרוחב המכל (1280 פחות padding) — כך הטבלה נמתחת
                    לרוחב המלא בלי גלילה אופקית, ורק במסך צר באמת היא נגללת. */}
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[880px] table-fixed text-sm text-right border-collapse">
                    {/* טלפון וסכום הם whitespace-nowrap — הם לא יכולים להתכווץ,
                        ואם צרים מדי הם דוחפים את הטבלה מעבר לרוחב שלה. לכן הם
                        מקבלים מקום מובטח, והמייל (break-all) מתכווץ במקומם. */}
                    <colgroup>
                      <col style={{ width: '16%' }} />  {/* שם */}
                      <col style={{ width: '11%' }} />  {/* ת.ז. */}
                      <col style={{ width: '14%' }} />  {/* רחוב */}
                      <col style={{ width: '10%' }} />  {/* עיר */}
                      <col style={{ width: '13%' }} />  {/* טלפון — nowrap */}
                      <col style={{ width: '16%' }} />  {/* מייל — נשבר */}
                      <col style={{ width: '11%' }} />  {/* סכום — nowrap */}
                      <col style={{ width: '9%' }} />   {/* סטטוס */}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">שם</th>
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">ת.ז.</th>
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">רחוב</th>
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">עיר</th>
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">טלפון</th>
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">מייל</th>
                        <th className="px-3 py-3.5 border-l border-slate-100 font-semibold">סכום מאושר</th>
                        <th className="px-3 py-3.5 font-semibold">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLoans.map((l, i) => {
                        const isDone = !!l.disbursed_at
                        return (
                          <tr key={l.id} className={`border-b border-slate-100 last:border-0 transition-colors ${isDone ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : `${i % 2 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-indigo-50/40`}`}>
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle">
                              <div className="font-semibold text-slate-900 break-words">{borrowerName(l.beneficiary)}</div>
                            </td>
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle tabular-nums text-slate-500 whitespace-nowrap" dir="ltr">{l.beneficiary?.id_number ?? '—'}</td>

                            {/* כתובת — רחוב ועיר בעמודות נפרדות. break-words מונע גלישה החוצה. */}
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle text-slate-600 break-words">
                              {l.beneficiary?.address || '—'}
                            </td>
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle text-slate-600 break-words">
                              {l.beneficiary?.city || '—'}
                            </td>
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle whitespace-nowrap">
                              {l.beneficiary?.phone
                                ? <a href={`tel:${l.beneficiary.phone}`} dir="ltr" className="text-slate-700 hover:text-indigo-600 tabular-nums">{l.beneficiary.phone}</a>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle">
                              {l.beneficiary?.email
                                ? <a href={`mailto:${l.beneficiary.email}`} dir="ltr" className="text-slate-700 hover:text-indigo-600 break-all">{l.beneficiary.email}</a>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-3.5 border-l border-slate-100 align-middle font-bold text-emerald-700 tabular-nums whitespace-nowrap">{fmtCur(shownAmount(l))}</td>
                            <td className="px-3 py-3.5 align-middle">
                              {isDone
                                ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 whitespace-nowrap"><CheckCircle2 size={13} /> בוצעה {fmtDate(l.disbursed_at)}</span>
                                : <button onClick={() => setActiveModal(l)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium px-2.5 py-1.5 hover:bg-indigo-100 transition-colors whitespace-nowrap"><Clock3 size={13} /> סמן כבוצעה</button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                <CreditCard size={36} strokeWidth={1.5} />
                <p className="text-sm">
                  {filter === 'pending' ? 'אין הלוואות הממתינות לביצוע' : filter === 'done' ? 'אין הלוואות שבוצעו' : 'אין הלוואות'}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {activeModal && (
        <DisburseModal
          loan={activeModal}
          onClose={() => setActiveModal(null)}
          onDone={handleDone}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LoansPortalPage() {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked'>('checking')

  useEffect(() => {
    // בדיקה אם יש כבר פגישה תקפה
    fetch('/api/shared/loans').then(r => {
      setState(r.status === 401 ? 'locked' : 'unlocked')
    }).catch(() => setState('locked'))
  }, [])

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <Loader2 size={28} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (state === 'locked') {
    return <PasswordScreen onAuth={() => setState('unlocked')} />
  }

  const logout = async () => {
    await fetch('/api/shared/loans/logout', { method: 'POST' }).catch(() => {})
    setState('locked')
  }

  return <PortalScreen onLogout={logout} />
}
