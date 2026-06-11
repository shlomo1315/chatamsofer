import Link from 'next/link'
import { Plus, Gift } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Distribution } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

async function getDistributions(): Promise<Distribution[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('distributions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'
const fmtCur = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
    : '—'

export default async function DistributionsPage() {
  const distributions = await getDistributions()
  const active = distributions.filter((d) => d.status === 'active' || d.status === 'planning').length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">חלוקות</h1>
          <p className="text-sm text-slate-500 mt-0.5">{distributions.length} חלוקות</p>
        </div>
        <Link href="/admin/distributions/new">
          <Button>
            <Plus size={16} />
            חלוקה חדשה
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'בתכנון / פעיל', value: active, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'הושלמו', value: distributions.filter((d) => d.status === 'completed').length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'סה״כ', value: distributions.length, color: 'text-slate-700', bg: 'bg-slate-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center border border-slate-200`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {distributions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Gift size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">לא נמצאו חלוקות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {distributions.map((dist) => (
            <Link key={dist.id} href={`/admin/distributions/${dist.id}`}>
              <Card className="hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                      {dist.name}
                    </h3>
                    {dist.holiday && (
                      <p className="text-xs text-slate-500 mt-0.5">{dist.holiday}</p>
                    )}
                  </div>
                  <StatusBadge status={dist.status} size="sm" />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{dist.distribution_date ? `תאריך: ${fmtDate(dist.distribution_date)}` : 'תאריך לא נקבע'}</span>
                  {dist.total_budget && (
                    <span className="font-medium text-slate-700 ltr-num">{fmtCur(dist.total_budget)}</span>
                  )}
                </div>
                {dist.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{dist.description}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
