import Link from 'next/link'
import { ArrowRight, Gift, Users, CheckCircle } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Distribution, DistributionRecipient } from '@/types'
import Card from '@/components/ui/Card'
import StatusBadge from '@/components/ui/StatusBadge'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

async function getDistribution(id: string): Promise<(Distribution & { recipients: DistributionRecipient[] }) | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createClient()
    const [{ data: dist }, { data: recipients }] = await Promise.all([
      supabase.from('distributions').select('*').eq('id', id).single(),
      supabase
        .from('distribution_recipients')
        .select('*, beneficiary:beneficiaries(full_name), family:families(family_name)')
        .eq('distribution_id', id),
    ])
    return dist ? { ...dist, recipients: recipients ?? [] } : null
  } catch {
    return null
  }
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'
const fmtCur = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
    : '—'

export default async function DistributionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const distribution = await getDistribution(id)

  if (!distribution && isSupabaseConfigured()) notFound()

  if (!distribution) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin/distributions" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <h1 className="text-xl font-bold">פרטי חלוקה</h1>
        </div>
        <div className="bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>
      </div>
    )
  }

  const received = distribution.recipients.filter((r) => r.status === 'received').length
  const totalRecipients = distribution.recipients.length

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/distributions" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{distribution.name}</h1>
            {distribution.holiday && <p className="text-sm text-slate-500">{distribution.holiday}</p>}
          </div>
        </div>
        <StatusBadge status={distribution.status} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'סה״כ מקבלים', value: totalRecipients, color: 'text-indigo-600' },
          { label: 'קיבלו', value: received, color: 'text-green-600' },
          { label: 'ממתינים', value: totalRecipients - received, color: 'text-amber-600' },
          { label: 'תקציב', value: fmtCur(distribution.total_budget), color: 'text-slate-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
            <p className={`text-xl font-bold ltr-num ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-slate-500">תאריך חלוקה: </span><span className="ltr-num">{fmtDate(distribution.distribution_date)}</span></div>
          <div><span className="text-slate-500">נוצר: </span><span className="ltr-num">{fmtDate(distribution.created_at)}</span></div>
        </div>
        {distribution.description && (
          <p className="text-sm text-slate-700 mt-3 pt-3 border-t border-slate-100">{distribution.description}</p>
        )}
      </Card>

      <Card padding="none">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">רשימת מקבלים</h2>
          </div>
          <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ הוסף מקבל</button>
        </div>
        {distribution.recipients.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <Gift size={32} className="mx-auto mb-2 text-slate-300" />
            טרם נוספו מקבלים לחלוקה זו
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {distribution.recipients.map((r) => {
              const name = r.beneficiary
                ? (r.beneficiary as { full_name: string }).full_name
                : r.family
                ? (r.family as { family_name: string }).family_name
                : '—'
              return (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    {r.status === 'received' && <CheckCircle size={14} className="text-green-500 flex-shrink-0" />}
                    <span className="text-sm text-slate-700">{name}</span>
                    {r.item_description && <span className="text-xs text-slate-400">({r.item_description})</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {r.amount && <span className="text-sm font-medium ltr-num">{fmtCur(r.amount)}</span>}
                    <StatusBadge
                      status={r.status}
                      customLabel={r.status === 'received' ? 'קיבל' : r.status === 'not_received' ? 'לא קיבל' : 'ממתין'}
                      size="sm"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
