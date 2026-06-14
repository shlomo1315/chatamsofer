import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import ReportsCharts from './ReportsChartsLazy'
import ReportBuilder from './ReportBuilder'

async function getReportData() {
  if (!isSupabaseConfigured()) {
    return { beneficiaries: [], loans: [], maternity: [] }
  }
  try {
    const supabase = await createClient()
    // Only the columns the charts/summaries below actually use
    const [b, l, m] = await Promise.all([
      supabase.from('beneficiaries').select('eligibility_status, city'),
      supabase.from('loans').select('status, amount'),
      supabase.from('maternity_aids').select('status, card_balance'),
    ])
    return {
      beneficiaries: b.data ?? [],
      loans: l.data ?? [],
      maternity: m.data ?? [],
    }
  } catch {
    return { beneficiaries: [], loans: [], maternity: [] }
  }
}

export default async function ReportsPage() {
  const data = await getReportData()

  const byEligibility = ['pending', 'approved', 'rejected', 'review'].map((s) => ({
    name: s === 'pending' ? 'ממתין' : s === 'approved' ? 'מאושר' : s === 'rejected' ? 'נדחה' : 'בבדיקה',
    value: data.beneficiaries.filter((b: { eligibility_status: string }) => b.eligibility_status === s).length,
  }))

  const byCity = Object.entries(
    data.beneficiaries.reduce((acc: Record<string, number>, b: { city?: string }) => {
      const city = b.city ?? 'לא ידוע'
      acc[city] = (acc[city] ?? 0) + 1
      return acc
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))

  const totalLoanAmount = data.loans.reduce((s: number, l: { amount: number }) => s + l.amount, 0)
  const activeLoanAmount = data.loans
    .filter((l: { status: string }) => l.status === 'active')
    .reduce((s: number, l: { amount: number }) => s + l.amount, 0)

  const fmtCur = (n: number) =>
    new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="דוחות וניתוח נתונים" subtitle="סטטיסטיקות, מגמות ובונה דוחות להורדה" />

      {/* בונה דוחות יולדות — סינון לפי תאריכים/סכומים/בתי החלמה/כרטיסים + הורדה */}
      <ReportBuilder />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'סה״כ צאצאים', value: data.beneficiaries.length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
          { label: 'צאצאים מאושרים', value: data.beneficiaries.filter((b: { eligibility_status: string }) => b.eligibility_status === 'approved').length, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
          { label: 'סכום הלוואות כולל', value: fmtCur(totalLoanAmount), color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'הלוואות פעילות', value: fmtCur(activeLoanAmount), color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} rounded-xl p-5 text-center border ${border} shadow-sm`}>
            <p className={`text-xl font-bold ltr-num ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <ReportsCharts byEligibility={byEligibility} byCity={byCity} />

      {/* Summary tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-4 pb-3 border-b border-slate-100">סיכום הלוואות</h2>
          <div className="space-y-2">
            {['pending', 'approved', 'active', 'completed', 'rejected', 'defaulted'].map((s) => {
              const count = data.loans.filter((l: { status: string }) => l.status === s).length
              const labels: Record<string, string> = {
                pending: 'ממתינות', approved: 'מאושרות', active: 'פעילות',
                completed: 'הושלמו', rejected: 'נדחו', defaulted: 'בפיגור',
              }
              const colors: Record<string, string> = {
                pending: 'bg-amber-400', approved: 'bg-blue-400', active: 'bg-green-400',
                completed: 'bg-slate-400', rejected: 'bg-red-400', defaulted: 'bg-orange-400',
              }
              return (
                <div key={s} className="flex items-center justify-between py-2 rounded-lg px-2 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors[s]}`} />
                    <span className="text-sm text-slate-700">{labels[s]}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-4 pb-3 border-b border-slate-100">נתוני יולדות</h2>
          <div className="space-y-2">
            {['pending', 'active', 'completed', 'cancelled'].map((s) => {
              const count = data.maternity.filter((m: { status: string }) => m.status === s).length
              const labels: Record<string, string> = {
                pending: 'ממתינות', active: 'פעילות', completed: 'הושלמו', cancelled: 'בוטלו',
              }
              const colors: Record<string, string> = {
                pending: 'bg-amber-400', active: 'bg-green-400', completed: 'bg-slate-400', cancelled: 'bg-red-400',
              }
              return (
                <div key={s} className="flex items-center justify-between py-2 rounded-lg px-2 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors[s]}`} />
                    <span className="text-sm text-slate-700">{labels[s]}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{count}</span>
                </div>
              )
            })}
            <div className="pt-3 mt-1 border-t border-slate-100">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm text-slate-500">יתרה כוללת בכרטיסים</span>
                <span className="text-sm font-semibold text-slate-900 ltr-num">
                  {fmtCur(data.maternity.reduce((s: number, m: { card_balance: number }) => s + (m.card_balance ?? 0), 0))}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
