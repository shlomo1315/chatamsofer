import {
  Users, Landmark, Baby, UtensilsCrossed, HeartHandshake,
  ClipboardList, Download, Mail, ArrowLeft, TrendingUp, CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'

interface DashData {
  totalBeneficiaries: number
  newBeneficiariesWeek: number
  approved: number
  pending: number
  activeLoans: number
  pendingLoans: number
  defaultedLoans: number
  loansApprovedWeek: number
  totalLoanAmount: number
  maternityActive: number
  maternityPending: number
  cardsLoaded: number
  cardsPending: number
  cardsRemaining: number
  widowPending: number
  widowInProgress: number
  distributionsPlanned: number
}

const EMPTY: DashData = {
  totalBeneficiaries: 0, newBeneficiariesWeek: 0, approved: 0, pending: 0,
  activeLoans: 0, pendingLoans: 0, defaultedLoans: 0, loansApprovedWeek: 0, totalLoanAmount: 0,
  maternityActive: 0, maternityPending: 0, cardsLoaded: 0, cardsPending: 0, cardsRemaining: 0,
  widowPending: 0, widowInProgress: 0, distributionsPlanned: 0,
}

async function getStats(): Promise<DashData> {
  if (!isSupabaseConfigured()) return EMPTY
  try {
    const supabase = await createClient()
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const [beneficiaries, loans, maternity, widows, distributions, cardCenters] = await Promise.all([
      supabase.from('beneficiaries').select('eligibility_status, created_at'),
      supabase.from('loans').select('status, amount, created_at'),
      supabase.from('maternity_aids').select('status, card_status'),
      supabase.from('widow_requests').select('status'),
      supabase.from('distributions').select('status').in('status', ['planning', 'active']),
      supabase.from('card_centers').select('stock'),
    ])
    const b = beneficiaries.data ?? []
    const l = loans.data ?? []
    const m = maternity.data ?? []
    const w = widows.data ?? []

    return {
      totalBeneficiaries: b.length,
      newBeneficiariesWeek: b.filter(x => x.created_at && x.created_at >= weekAgo).length,
      approved: b.filter(x => x.eligibility_status === 'approved').length,
      pending: b.filter(x => x.eligibility_status === 'pending').length,
      activeLoans: l.filter(x => x.status === 'active').length,
      pendingLoans: l.filter(x => x.status === 'pending').length,
      defaultedLoans: l.filter(x => x.status === 'defaulted').length,
      loansApprovedWeek: l.filter(x => ['active', 'approved', 'completed'].includes(x.status) && x.created_at && x.created_at >= weekAgo).length,
      totalLoanAmount: l.filter(x => x.status === 'active').reduce((s, x) => s + (Number(x.amount) || 0), 0),
      maternityActive: m.filter(x => x.status === 'active').length,
      maternityPending: m.filter(x => x.status === 'pending').length,
      cardsLoaded: m.filter(x => x.card_status === 'loaded').length,
      cardsPending: m.filter(x => x.status === 'active' && (!x.card_status || x.card_status === 'pending')).length,
      cardsRemaining: ((cardCenters.data ?? []).reduce((sum, c) => sum + (Number(c.stock) || 0), 0)) - m.filter(x => x.card_status === 'loaded').length,
      widowPending: w.filter(x => x.status === 'pending').length,
      widowInProgress: w.filter(x => x.status === 'in_progress').length,
      distributionsPlanned: distributions.count ?? (distributions.data?.length ?? 0),
    }
  } catch {
    return EMPTY
  }
}

const fmtCur = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
const fmt = (n: number) => n.toLocaleString('he-IL')

interface Metric { label: string; value: string; tone?: string }
interface Dept {
  title: string
  icon: typeof Users
  grad: string
  href: string
  metrics: Metric[]
}

export default async function DashboardPage() {
  const s = await getStats()

  const departments: Dept[] = [
    {
      title: 'איגוד הצאצאים', icon: Users, grad: 'from-indigo-500 to-violet-600', href: '/admin/beneficiaries',
      metrics: [
        { label: 'משפחות רשומות', value: fmt(s.totalBeneficiaries), tone: 'text-slate-900' },
        { label: 'נרשמו השבוע', value: fmt(s.newBeneficiariesWeek), tone: 'text-indigo-600' },
        { label: 'ממתינים לאישור', value: fmt(s.pending), tone: 'text-amber-600' },
      ],
    },
    {
      title: 'גמ״ח — הלוואות', icon: Landmark, grad: 'from-blue-500 to-cyan-600', href: '/admin/loans',
      metrics: [
        { label: 'בקשות חדשות לאישור', value: fmt(s.pendingLoans), tone: 'text-amber-600' },
        { label: 'הלוואות פעילות', value: fmt(s.activeLoans), tone: 'text-slate-900' },
        { label: 'בפיגור', value: fmt(s.defaultedLoans), tone: 'text-red-600' },
      ],
    },
    {
      title: 'עזר יולדות', icon: Baby, grad: 'from-pink-500 to-rose-600', href: '/admin/maternity',
      metrics: [
        { label: 'בקשות חדשות לאישור', value: fmt(s.maternityPending), tone: 'text-amber-600' },
        { label: 'תיקים פעילים', value: fmt(s.maternityActive), tone: 'text-slate-900' },
      ],
    },
    {
      title: 'כרטיסי מזון יולדות', icon: UtensilsCrossed, grad: 'from-emerald-500 to-green-600', href: '/admin/maternity/cards',
      metrics: [
        { label: 'ממתינות לכרטיס', value: fmt(s.cardsPending), tone: 'text-amber-600' },
        { label: 'מלאי נותר', value: fmt(s.cardsRemaining), tone: 'text-emerald-600' },
      ],
    },
    {
      title: 'אלמנות ויתומים', icon: HeartHandshake, grad: 'from-purple-500 to-fuchsia-600', href: '/admin/widows',
      metrics: [
        { label: 'בקשות חדשות', value: fmt(s.widowPending), tone: 'text-amber-600' },
        { label: 'בטיפול', value: fmt(s.widowInProgress), tone: 'text-blue-600' },
      ],
    },
  ]

  const pendingTotal = s.pending + s.pendingLoans + s.maternityPending + s.widowPending

  const actions = [
    { title: 'משימות ממתינות לטיפול', desc: `${fmt(pendingTotal)} פריטים ממתינים`, icon: ClipboardList, href: '/admin/beneficiaries?status=pending', grad: 'from-amber-500 to-orange-500' },
    { title: 'הורדת דוחו״ת', desc: 'דוחות וסטטיסטיקות', icon: Download, href: '/admin/reports', grad: 'from-slate-600 to-slate-800' },
    { title: 'כניסה לתיבת המייל', desc: 'דואר נכנס ויוצא', icon: Mail, href: '/admin/mail', grad: 'from-cyan-500 to-blue-600' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-indigo-600 via-violet-600 to-fuchsia-600 p-7 text-white shadow-lg">
        <div className="absolute -left-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
        <div className="absolute left-24 -bottom-16 w-56 h-56 rounded-full bg-white/5" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">לוח בקרה</h1>
            <p className="text-sm text-indigo-100 mt-1">סקירת אגפי העמותה — היכל החתם סופר</p>
          </div>
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur rounded-xl px-4 py-2 text-sm">
            <TrendingUp size={16} />
            <span>{fmt(s.totalBeneficiaries)} משפחות · {fmtCur(s.totalLoanAmount)} בהלוואות פעילות</span>
          </div>
        </div>
      </div>

      {!isSupabaseConfigured() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>מצב פיתוח:</strong> Supabase לא מוגדר — מוצגים נתוני אפס.
        </div>
      )}

      {/* Department cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {departments.map(({ title, icon: Icon, grad, href, metrics }) => (
          <Link key={title} href={href}
            className="group flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden">
            <div className={`bg-gradient-to-br ${grad} px-4 py-4 flex items-center gap-3 text-white`}>
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Icon size={20} />
              </span>
              <h3 className="font-bold text-[15px] leading-tight">{title}</h3>
            </div>
            <div className="flex flex-col gap-2.5 p-4 flex-1">
              {metrics.map(m => (
                <div key={m.label} className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-slate-500">{m.label}</span>
                  <span className={`text-lg font-bold ltr-num ${m.tone ?? 'text-slate-900'}`}>{m.value}</span>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
                כניסה לאגף <ArrowLeft size={13} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actions.map(({ title, desc, icon: Icon, href, grad }) => (
          <Link key={title} href={href}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all p-5">
            <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white flex-shrink-0 shadow-sm`}>
              <Icon size={22} />
            </span>
            <div className="flex-1">
              <p className="font-bold text-slate-900">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
            <ArrowLeft size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
        <CheckCircle2 size={14} className="text-green-500" /> הנתונים מתעדכנים בזמן אמת
      </div>
    </div>
  )
}
