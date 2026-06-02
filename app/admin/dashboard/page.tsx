import { Users, CreditCard, Baby, Gift, Clock, TrendingUp, CheckCircle2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import DashboardCharts, { MonthlyPoint, SlicePoint } from './DashboardCharts'
import { format, subMonths, startOfMonth } from 'date-fns'
import { he } from 'date-fns/locale'

interface DashData {
  totalBeneficiaries: number
  approved: number
  pending: number
  rejected: number
  review: number
  activeLoans: number
  pendingLoans: number
  defaultedLoans: number
  totalLoanAmount: number
  maternityActive: number
  maternityPending: number
  distributionsPlanned: number
  monthly: MonthlyPoint[]
  statusData: SlicePoint[]
}

const EMPTY: DashData = {
  totalBeneficiaries: 0, approved: 0, pending: 0, rejected: 0, review: 0,
  activeLoans: 0, pendingLoans: 0, defaultedLoans: 0, totalLoanAmount: 0,
  maternityActive: 0, maternityPending: 0, distributionsPlanned: 0,
  monthly: [], statusData: [],
}

function buildMonthly(benDates: string[], loanDates: string[]): MonthlyPoint[] {
  const buckets: { key: string; label: string; נתמכים: number; הלוואות: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = startOfMonth(subMonths(new Date(), i))
    buckets.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM', { locale: he }), נתמכים: 0, הלוואות: 0 })
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]))
  for (const d of benDates) { const i = idx.get(format(new Date(d), 'yyyy-MM')); if (i !== undefined) buckets[i].נתמכים++ }
  for (const d of loanDates) { const i = idx.get(format(new Date(d), 'yyyy-MM')); if (i !== undefined) buckets[i].הלוואות++ }
  return buckets.map(b => ({ month: b.label, נתמכים: b.נתמכים, הלוואות: b.הלוואות }))
}

async function getStats(): Promise<DashData> {
  if (!isSupabaseConfigured()) return EMPTY
  try {
    const supabase = await createClient()
    const [beneficiaries, loans, maternity, distributions] = await Promise.all([
      supabase.from('beneficiaries').select('eligibility_status, created_at'),
      supabase.from('loans').select('status, amount, created_at'),
      supabase.from('maternity_aids').select('status'),
      supabase.from('distributions').select('status').in('status', ['planning', 'active']),
    ])
    const b = beneficiaries.data ?? []
    const l = loans.data ?? []
    const m = maternity.data ?? []

    const approved = b.filter(x => x.eligibility_status === 'approved').length
    const pending = b.filter(x => x.eligibility_status === 'pending').length
    const rejected = b.filter(x => x.eligibility_status === 'rejected').length
    const review = b.filter(x => x.eligibility_status === 'review').length

    return {
      totalBeneficiaries: b.length,
      approved, pending, rejected, review,
      activeLoans: l.filter(x => x.status === 'active').length,
      pendingLoans: l.filter(x => x.status === 'pending').length,
      defaultedLoans: l.filter(x => x.status === 'defaulted').length,
      totalLoanAmount: l.filter(x => x.status === 'active').reduce((s, x) => s + (Number(x.amount) || 0), 0),
      maternityActive: m.filter(x => x.status === 'active').length,
      maternityPending: m.filter(x => x.status === 'pending').length,
      distributionsPlanned: distributions.count ?? (distributions.data?.length ?? 0),
      monthly: buildMonthly(b.map(x => x.created_at).filter(Boolean), l.map(x => x.created_at).filter(Boolean)),
      statusData: [
        { name: 'מאושרים', value: approved, color: '#22c55e' },
        { name: 'ממתינים', value: pending, color: '#f59e0b' },
        { name: 'בבדיקה', value: review, color: '#3b82f6' },
        { name: 'נדחו', value: rejected, color: '#ef4444' },
      ],
    }
  } catch {
    return EMPTY
  }
}

const fmtCur = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

export default async function DashboardPage() {
  const s = await getStats()

  const heroStats = [
    { title: 'סה״כ נתמכים', value: s.totalBeneficiaries.toLocaleString('he-IL'), sub: `${s.approved} מאושרים`, icon: Users, grad: 'from-indigo-500 to-violet-500', href: '/admin/beneficiaries' },
    { title: 'ממתינים לאישור', value: s.pending.toLocaleString('he-IL'), sub: 'נתמכים', icon: Clock, grad: 'from-amber-500 to-orange-500', href: '/admin/beneficiaries?status=pending' },
    { title: 'הלוואות פעילות', value: s.activeLoans.toLocaleString('he-IL'), sub: fmtCur(s.totalLoanAmount), icon: CreditCard, grad: 'from-blue-500 to-cyan-500', href: '/admin/loans' },
    { title: 'יולדות פעילות', value: s.maternityActive.toLocaleString('he-IL'), sub: `${s.maternityPending} ממתינות`, icon: Baby, grad: 'from-pink-500 to-rose-500', href: '/admin/maternity' },
    { title: 'חלוקות מתוכננות', value: s.distributionsPlanned.toLocaleString('he-IL'), sub: 'פעילות', icon: Gift, grad: 'from-purple-500 to-fuchsia-500', href: '/admin/distributions' },
    { title: 'יתרת הלוואות', value: fmtCur(s.totalLoanAmount), sub: 'בפעילות', icon: TrendingUp, grad: 'from-emerald-500 to-green-500', href: '/admin/loans' },
  ]

  const systemRows = [
    { label: 'נתמכים מאושרים', value: s.approved, total: s.totalBeneficiaries, color: 'bg-green-500', tone: 'text-green-600' },
    { label: 'ממתינים לאישור', value: s.pending, total: s.totalBeneficiaries, color: 'bg-amber-500', tone: 'text-amber-600' },
    { label: 'יולדות ממתינות לאישור', value: s.maternityPending, total: s.maternityActive + s.maternityPending, color: 'bg-pink-500', tone: 'text-pink-600' },
    { label: 'חלוקות בתכנון', value: s.distributionsPlanned, total: s.distributionsPlanned, color: 'bg-purple-500', tone: 'text-purple-600' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-indigo-600 via-indigo-600 to-violet-600 p-6 text-white shadow-lg">
        <div className="absolute -left-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -left-16 bottom-0 w-48 h-48 rounded-full bg-white/5" />
        <div className="relative">
          <h1 className="text-2xl font-bold">לוח בקרה</h1>
          <p className="text-sm text-indigo-100 mt-1">סקירה כללית של פעילות העמותה — היכל החתם סופר</p>
        </div>
      </div>

      {!isSupabaseConfigured() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>מצב פיתוח:</strong> Supabase לא מוגדר — מוצגים נתוני אפס.
        </div>
      )}

      {/* Stat cards — clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {heroStats.map(({ title, value, sub, icon: Icon, grad, href }) => (
          <Link key={title} href={href}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md hover:border-indigo-200 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white mb-3 shadow-sm`}>
              <Icon size={19} />
            </div>
            <p className="text-2xl font-bold text-slate-900 ltr-num leading-none">{value}</p>
            <p className="text-xs font-medium text-slate-500 mt-1.5">{title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 ltr-num">{sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardCharts statusData={s.statusData} />

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">פעולות מהירות</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/admin/beneficiaries/new', label: 'רישום נתמך חדש', icon: Users, color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
              { href: '/admin/maternity/new', label: 'פתיחת תיק יולדת', icon: Baby, color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
              { href: '/admin/loans/new', label: 'בקשת הלוואה', icon: CreditCard, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
              { href: '/admin/distributions/new', label: 'חלוקה חדשה', icon: Gift, color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
            ].map(({ href, label, icon: Icon, color }) => (
              <Link key={href} href={href}
                className={`flex items-center justify-between gap-2 rounded-xl p-3.5 text-sm font-medium transition-colors ${color}`}>
                <span className="flex items-center gap-2"><Icon size={16} />{label}</span>
                <ArrowLeft size={14} className="opacity-50" />
              </Link>
            ))}
          </div>
        </div>

        {/* System summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">סיכום מצב מערכת</h2>
          <div className="space-y-4">
            {systemRows.map(({ label, value, total, color, tone }) => {
              const pct = total > 0 ? Math.round((value / total) * 100) : 0
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${color}`} />{label}
                    </span>
                    <span className={`text-xs font-bold ${tone} ltr-num`}>{value}{total > 0 && <span className="text-slate-400 font-normal"> / {total}</span>}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={14} className="text-green-500" /> הנתונים מעודכנים בזמן אמת
          </div>
        </div>
      </div>
    </div>
  )
}
