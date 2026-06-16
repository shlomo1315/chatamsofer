import {
  Users, Landmark, Baby, UtensilsCrossed, HeartHandshake,
  HandCoins, Mail, TrendingUp, Clock, AlertCircle, CheckCircle2,
  ArrowLeft, ArrowUpRight, Download,
} from 'lucide-react'
import Link from 'next/link'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import PendingTasksPanel from './PendingTasksPanel'

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
  aidPending: number
  aidAwaiting: number
  aidApproved: number
}

const EMPTY: DashData = {
  totalBeneficiaries: 0, newBeneficiariesWeek: 0, approved: 0, pending: 0,
  activeLoans: 0, pendingLoans: 0, defaultedLoans: 0, loansApprovedWeek: 0, totalLoanAmount: 0,
  maternityActive: 0, maternityPending: 0, cardsLoaded: 0, cardsPending: 0, cardsRemaining: 0,
  widowPending: 0, widowInProgress: 0, distributionsPlanned: 0,
  aidPending: 0, aidAwaiting: 0, aidApproved: 0,
}

async function getStats(): Promise<DashData> {
  if (!isSupabaseConfigured()) return EMPTY
  try {
    const supabase = await createClient()
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const headCount = { count: 'exact' as const, head: true }
    const [
      totalBeneficiaries, newBeneficiariesWeek, approved, pending,
      activeLoans, pendingLoans, defaultedLoans, loansApprovedWeek,
      maternityActive, maternityPending, cardsLoaded, cardsPending,
      widowPending, widowInProgress, distributionsPlanned,
      aidPending, aidAwaiting, aidApproved,
      activeLoanAmounts, cardCenters,
    ] = await Promise.all([
      supabase.from('beneficiaries').select('id', headCount),
      supabase.from('beneficiaries').select('id', headCount).gte('created_at', weekAgo),
      supabase.from('beneficiaries').select('id', headCount).eq('eligibility_status', 'approved'),
      supabase.from('beneficiaries').select('id', headCount).eq('eligibility_status', 'pending'),
      supabase.from('loans').select('id', headCount).eq('status', 'active'),
      supabase.from('loans').select('id', headCount).eq('status', 'pending'),
      supabase.from('loans').select('id', headCount).eq('status', 'defaulted'),
      supabase.from('loans').select('id', headCount).in('status', ['active', 'approved', 'completed']).gte('created_at', weekAgo),
      supabase.from('maternity_aids').select('id', headCount).eq('status', 'active'),
      supabase.from('maternity_aids').select('id', headCount).eq('status', 'pending'),
      supabase.from('maternity_aids').select('id', headCount).eq('card_status', 'loaded'),
      supabase.from('maternity_aids').select('id', headCount).eq('status', 'active').or('card_status.is.null,card_status.eq.pending'),
      supabase.from('widow_requests').select('id', headCount).eq('status', 'pending'),
      supabase.from('widow_requests').select('id', headCount).eq('status', 'in_progress'),
      supabase.from('distributions').select('id', headCount).in('status', ['planning', 'active']),
      supabase.from('financial_aid_requests').select('id', headCount).eq('status', 'pending'),
      supabase.from('financial_aid_requests').select('id', headCount).eq('status', 'awaiting_decision'),
      supabase.from('financial_aid_requests').select('id', headCount).eq('status', 'approved'),
      supabase.from('loans').select('amount').eq('status', 'active'),
      supabase.from('card_centers').select('stock'),
    ])

    const loadedCount = cardsLoaded.count ?? 0
    return {
      totalBeneficiaries: totalBeneficiaries.count ?? 0,
      newBeneficiariesWeek: newBeneficiariesWeek.count ?? 0,
      approved: approved.count ?? 0,
      pending: pending.count ?? 0,
      activeLoans: activeLoans.count ?? 0,
      pendingLoans: pendingLoans.count ?? 0,
      defaultedLoans: defaultedLoans.count ?? 0,
      loansApprovedWeek: loansApprovedWeek.count ?? 0,
      totalLoanAmount: (activeLoanAmounts.data ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0),
      maternityActive: maternityActive.count ?? 0,
      maternityPending: maternityPending.count ?? 0,
      cardsLoaded: loadedCount,
      cardsPending: cardsPending.count ?? 0,
      cardsRemaining: ((cardCenters.data ?? []).reduce((sum, c) => sum + (Number(c.stock) || 0), 0)) - loadedCount,
      widowPending: widowPending.count ?? 0,
      widowInProgress: widowInProgress.count ?? 0,
      distributionsPlanned: distributionsPlanned.count ?? 0,
      aidPending: aidPending.count ?? 0,
      aidAwaiting: aidAwaiting.count ?? 0,
      aidApproved: aidApproved.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

const fmtCur = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
const fmt = (n: number) => n.toLocaleString('he-IL')

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  return 'ערב טוב'
}


export default async function DashboardPage() {
  const s = await getStats()
  const pendingTotal = s.pending + s.pendingLoans + s.maternityPending + s.widowPending + s.aidPending

  return (
    <div className="flex flex-col gap-8 pb-10">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{getGreeting()}</h1>
          <p className="text-slate-500 mt-1 text-sm">ברוך הבא ללוח הבקרה של היכל החתם סופר</p>
        </div>
        <Link href="/admin/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors">
          <Download size={15} />
          הורדת דוחות
        </Link>
      </div>

      {!isSupabaseConfigured() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span><strong>מצב פיתוח:</strong> Supabase לא מוגדר — מוצגים נתוני אפס.</span>
        </div>
      )}

      {/* ── KPI Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="משפחות רשומות"
          value={fmt(s.totalBeneficiaries)}
          sub={`${fmt(s.newBeneficiariesWeek)} נרשמו השבוע`}
          subPositive
          icon={<Users size={18} />}
          color="indigo"
          href="/admin/beneficiaries"
        />
        <KpiCard
          label="הלוואות פעילות"
          value={fmtCur(s.totalLoanAmount)}
          sub={`${fmt(s.activeLoans)} תיקים פעילים`}
          icon={<Landmark size={18} />}
          color="blue"
          href="/admin/loans"
        />
        <PendingTasksPanel count={pendingTotal} />
        <KpiCard
          label="תיבת המייל"
          value="מייל"
          sub="דואר נכנס ויוצא"
          icon={<Mail size={18} />}
          color="violet"
          href="/admin/mail"
        />
      </div>

      {/* ── Departments ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-4">אגפי העמותה</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

          <DeptCard
            title="איגוד הצאצאים"
            icon={<Users size={20} />}
            href="/admin/beneficiaries"
            accent="#6366f1"
            rows={[
              { label: 'רשומות מאושרות', value: fmt(s.approved), tone: 'success' },
              { label: 'ממתינות לאישור', value: fmt(s.pending), tone: s.pending > 0 ? 'warning' : 'neutral' },
              { label: 'נרשמו השבוע', value: fmt(s.newBeneficiariesWeek), tone: 'info' },
            ]}
          />

          <DeptCard
            title="גמ״ח — הלוואות"
            icon={<Landmark size={20} />}
            href="/admin/loans"
            accent="#3b82f6"
            rows={[
              { label: 'בקשות לאישור', value: fmt(s.pendingLoans), tone: s.pendingLoans > 0 ? 'warning' : 'neutral' },
              { label: 'הלוואות פעילות', value: fmt(s.activeLoans), tone: 'success' },
              { label: 'בפיגור', value: fmt(s.defaultedLoans), tone: s.defaultedLoans > 0 ? 'danger' : 'neutral' },
            ]}
          />

          <DeptCard
            title="עזר יולדות"
            icon={<Baby size={20} />}
            href="/admin/maternity"
            accent="#ec4899"
            rows={[
              { label: 'בקשות לאישור', value: fmt(s.maternityPending), tone: s.maternityPending > 0 ? 'warning' : 'neutral' },
              { label: 'תיקים פעילים', value: fmt(s.maternityActive), tone: 'success' },
            ]}
          />

          <DeptCard
            title="כרטיסי מזון יולדות"
            icon={<UtensilsCrossed size={20} />}
            href="/admin/maternity/cards"
            accent="#10b981"
            rows={[
              { label: 'ממתינות לכרטיס', value: fmt(s.cardsPending), tone: s.cardsPending > 0 ? 'warning' : 'neutral' },
              { label: 'כרטיסים טעונים', value: fmt(s.cardsLoaded), tone: 'success' },
              { label: 'מלאי נותר', value: fmt(s.cardsRemaining), tone: s.cardsRemaining < 5 ? 'danger' : 'info' },
            ]}
          />

          <DeptCard
            title="אלמנות ויתומים"
            icon={<HeartHandshake size={20} />}
            href="/admin/widows"
            accent="#a855f7"
            rows={[
              { label: 'בקשות חדשות', value: fmt(s.widowPending), tone: s.widowPending > 0 ? 'warning' : 'neutral' },
              { label: 'בטיפול', value: fmt(s.widowInProgress), tone: 'info' },
            ]}
          />

          <DeptCard
            title="סיוע רפואי"
            icon={<HandCoins size={20} />}
            href="/admin/financial-aid"
            accent="#14b8a6"
            rows={[
              { label: 'בקשות חדשות', value: fmt(s.aidPending), tone: s.aidPending > 0 ? 'warning' : 'neutral' },
              { label: 'נשלחו לאישור', value: fmt(s.aidAwaiting), tone: 'info' },
              { label: 'אושרו', value: fmt(s.aidApproved), tone: 'success' },
            ]}
          />

        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
        <CheckCircle2 size={13} className="text-emerald-500" />
        הנתונים מתעדכנים בזמן אמת
      </div>
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-600 text-white', text: 'text-indigo-600' },
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-600 text-white',   text: 'text-blue-600'   },
  amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-500 text-white',  text: 'text-amber-600'  },
  violet: { bg: 'bg-violet-50', icon: 'bg-violet-600 text-white', text: 'text-violet-600' },
}

function KpiCard({ label, value, sub, subPositive, subWarning, icon, color, href }: {
  label: string; value: string; sub: string
  subPositive?: boolean; subWarning?: boolean
  icon: React.ReactNode; color: string; href: string
}) {
  const c = colorMap[color] ?? colorMap.indigo
  return (
    <Link href={href}
      className={`group relative flex flex-col gap-3 rounded-2xl border border-slate-100 ${c.bg} p-5 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
      <div className="flex items-center justify-between">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.icon} shadow-sm`}>
          {icon}
        </span>
        <ArrowUpRight size={15} className={`${c.text} opacity-0 group-hover:opacity-100 transition-opacity`} />
      </div>
      <div>
        <p className="text-[13px] text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900 ltr-num">{value}</p>
      </div>
      <p className={`text-xs font-medium ${subWarning ? 'text-amber-600' : subPositive ? 'text-emerald-600' : 'text-slate-400'}`}>
        {sub}
      </p>
    </Link>
  )
}

// ── Department Card ──────────────────────────────────────────────────────────

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const toneClass: Record<Tone, string> = {
  success: 'text-emerald-600 bg-emerald-50',
  warning: 'text-amber-600 bg-amber-50',
  danger:  'text-red-600 bg-red-50',
  info:    'text-blue-600 bg-blue-50',
  neutral: 'text-slate-500 bg-slate-50',
}

function DeptCard({ title, icon, href, accent, rows }: {
  title: string; icon: React.ReactNode; href: string
  accent: string
  rows: { label: string; value: string; tone: Tone }[]
}) {
  return (
    <Link href={href}
      className="group flex flex-col rounded-2xl border border-slate-100 bg-white hover:shadow-lg hover:border-slate-200 transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: accent }}>
            {icon}
          </span>
          <h3 className="font-semibold text-slate-800 text-[15px]">{title}</h3>
        </div>
        <ArrowLeft size={15} className="text-slate-300 group-hover:text-slate-600 transition-colors" />
      </div>
      {/* Rows */}
      <div className="flex flex-col divide-y divide-slate-50 px-5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between py-3">
            <span className="text-[13px] text-slate-500">{r.label}</span>
            <span className={`text-sm font-bold ltr-num px-2.5 py-0.5 rounded-full ${toneClass[r.tone]}`}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </Link>
  )
}
