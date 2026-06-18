import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Distribution } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import DistributionsClient from './DistributionsClient'

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

export default async function DistributionsPage() {
  const distributions = await getDistributions()
  const active = distributions.filter((d) => d.status === 'active' || d.status === 'planning').length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="חלוקות" subtitle={`${distributions.length} חלוקות`}>
        <Link href="/admin/distributions/new">
          <Button>
            <Plus size={16} />
            חלוקה חדשה
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'בתכנון / פעיל', value: active, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
          { label: 'הושלמו', value: distributions.filter((d) => d.status === 'completed').length, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
          { label: 'סה״כ', value: distributions.length, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} rounded-xl p-5 text-center border ${border} shadow-sm`}>
            <p className={`text-3xl font-bold ltr-num ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <DistributionsClient distributions={distributions} />
    </div>
  )
}
