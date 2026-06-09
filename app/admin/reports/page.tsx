import { BarChart3, Download } from 'lucide-react'
import Card from '@/components/ui/Card'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import ReportsCharts from './ReportsCharts'

async function getReportData() {
  if (!isSupabaseConfigured()) {
    return { beneficiaries: [], loans: [], maternity: [], distributions: [] }
  }
  try {
    const supabase = await createClient()
    const [b, l, m, d] = await Promise.all([
      supabase.from('beneficiaries').select('eligibility_status, gender, city, created_at'),
      supabase.from('loans').select('status, amount, monthly_payment, created_at'),
      supabase.from('maternity_aids').select('status, card_balance, created_at'),
      supabase.from('distributions').select('status, total_budget, distribution_date'),
    ])
    return {
      beneficiaries: b.data ?? [],
      loans: l.data ?? [],
      maternity: m.data ?? [],
      distributions: d.data ?? [],
    }
  } catch {
    return { beneficiaries: [], loans: [], maternity: [], distributions: [] }
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
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">דוחות וניתוח נתונים</h1>
          <p className="text-sm text-slate-500 mt-0.5">סטטיסטיקות ומגמות</p>
        </div>
        <button className="flex items-center gap-2 text-sm text-slate-600 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50 transition-colors">
          <Download size={16} />
          ייצוא דוח
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'סה״כ צאצאים', value: data.beneficiaries.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'צאצאים מאושרים', value: data.beneficiaries.filter((b: { eligibility_status: string }) => b.eligibility_status === 'approved').length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'סכום הלוואות כולל', value: fmtCur(totalLoanAmount), color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'הלוואות פעילות', value: fmtCur(activeLoanAmount), color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center border border-slate-200`}>
            <p className={`text-xl font-bold ltr-num ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <ReportsCharts byEligibility={byEligibility} byCity={byCity} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">סיכום הלוואות</h2>
          <div className="space-y-3">
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
                <div key={s} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${colors[s]}`} />
                    <span className="text-sm text-slate-700">{labels[s]}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">נתוני יולדות</h2>
          <div className="space-y-3">
            {['pending', 'active', 'completed', 'cancelled'].map((s) => {
              const count = data.maternity.filter((m: { status: string }) => m.status === s).length
              const labels: Record<string, string> = {
                pending: 'ממתינות', active: 'פעילות', completed: 'הושלמו', cancelled: 'בוטלו',
              }
              const colors: Record<string, string> = {
                pending: 'bg-amber-400', active: 'bg-green-400', completed: 'bg-slate-400', cancelled: 'bg-red-400',
              }
              return (
                <div key={s} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${colors[s]}`} />
                    <span className="text-sm text-slate-700">{labels[s]}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{count}</span>
                </div>
              )
            })}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
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
