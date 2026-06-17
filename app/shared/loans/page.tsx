'use client'
import { useState, useEffect, useCallback } from 'react'
import { Lock, LogIn, LogOut, CreditCard, CheckCircle2, Clock3, Loader2, Calendar, User, RefreshCw, IdCard, Mail, Phone } from 'lucide-react'

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

// ── Loan Card ─────────────────────────────────────────────────────────────────
function LoanCard({ loan, onDisburse }: { loan: PortalLoan; onDisburse: () => void }) {
  const isDone = !!loan.disbursed_at
  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all ${isDone ? 'border-emerald-200 opacity-75' : 'border-slate-200 hover:border-indigo-200 hover:shadow-md'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${isDone ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
              {isDone
                ? <CheckCircle2 size={20} className="text-emerald-600" />
                : <CreditCard size={20} className="text-indigo-600" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{borrowerName(loan.beneficiary)}</p>
              {loan.beneficiary?.city && (
                <p className="text-xs text-slate-500 mt-0.5">{loan.beneficiary.city}</p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-left">
            <p className="text-xl font-bold text-slate-900 tabular-nums">{fmtCur(shownAmount(loan))}</p>
            <p className="text-[10px] text-emerald-600 font-medium">סכום מאושר</p>
            <p className="text-xs text-slate-500 text-left">{loan.installments} תשלומים</p>
          </div>
        </div>

        {loan.purpose && (
          <div className="mt-4 bg-slate-50 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">מטרה</p>
            <p className="text-sm text-slate-700 mt-0.5 truncate">{loan.purpose}</p>
          </div>
        )}

        {/* פרטי מבקש ההלוואה */}
        <div className="mt-3 flex flex-col gap-1.5">
          {loan.beneficiary?.id_number && (
            <p className="text-xs text-slate-600 flex items-center gap-1.5">
              <IdCard size={13} className="text-slate-400 flex-shrink-0" />
              <span className="text-slate-400">ת.ז.</span>
              <span dir="ltr" className="tabular-nums">{loan.beneficiary.id_number}</span>
            </p>
          )}
          {loan.beneficiary?.email && (
            <a href={`mailto:${loan.beneficiary.email}`} className="text-xs text-slate-600 hover:text-indigo-600 flex items-center gap-1.5">
              <Mail size={13} className="text-slate-400 flex-shrink-0" />
              <span dir="ltr" className="truncate">{loan.beneficiary.email}</span>
            </a>
          )}
          {loan.beneficiary?.phone && (
            <a href={`tel:${loan.beneficiary.phone}`} className="text-xs text-slate-600 hover:text-indigo-600 flex items-center gap-1.5">
              <Phone size={13} className="text-slate-400 flex-shrink-0" />
              <span dir="ltr">{loan.beneficiary.phone}</span>
            </a>
          )}
        </div>

        {isDone ? (
          <div className="mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-emerald-700">בוצעה ב-{fmtDate(loan.disbursed_at)}</span>
              {loan.disbursed_by && <span className="text-emerald-600"> · על ידי {loan.disbursed_by}</span>}
            </div>
          </div>
        ) : (
          <button
            onClick={onDisburse}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white text-sm font-semibold py-2.5 shadow-md shadow-indigo-200 hover:opacity-90 transition-opacity"
          >
            <Clock3 size={15} />
            סמן כבוצעה
          </button>
        )}
      </div>
    </div>
  )
}

// ── Portal Screen ─────────────────────────────────────────────────────────────
function PortalScreen({ onLogout }: { onLogout: () => void }) {
  const [loans, setLoans] = useState<PortalLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState<PortalLoan | null>(null)

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-8">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'סה״כ הלוואות', value: loans.length, color: 'text-slate-900', bg: 'bg-white' },
            { label: 'ממתינות לביצוע', value: pending.length, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            { label: 'בוצעו', value: done.length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl border border-slate-200 p-4 text-center`}>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">טוען הלוואות...</p>
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Clock3 size={15} className="text-amber-500" />
                  ממתינות לביצוע ({pending.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pending.map(l => (
                    <LoanCard key={l.id} loan={l} onDisburse={() => setActiveModal(l)} />
                  ))}
                </div>
              </section>
            )}

            {/* Done */}
            {done.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  בוצעו ({done.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {done.map(l => (
                    <LoanCard key={l.id} loan={l} onDisburse={() => {}} />
                  ))}
                </div>
              </section>
            )}

            {loans.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                <CreditCard size={36} strokeWidth={1.5} />
                <p className="text-sm">אין הלוואות מאושרות כרגע</p>
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
