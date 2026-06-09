import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import BeneficiariesTable from './BeneficiariesTable'

async function getBeneficiaries(): Promise<Beneficiary[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('beneficiaries')
      .select('*')
      .order('created_at', { ascending: false })
    return data ?? []
  } catch {
    return []
  }
}

export default async function BeneficiariesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [beneficiaries, params] = await Promise.all([getBeneficiaries(), searchParams])
  const validFilters = ['all', 'pending', 'approved', 'rejected'] as const
  type Filter = typeof validFilters[number]
  const initialFilter: Filter = validFilters.includes(params.status as Filter) ? (params.status as Filter) : 'all'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">צאצאים</h1>
          <p className="text-sm text-slate-500 mt-0.5">{beneficiaries.length} רשומות</p>
        </div>
        <Link href="/admin/beneficiaries/new">
          <Button>
            <Plus size={16} />
            רישום צאצא חדש
          </Button>
        </Link>
      </div>

      <BeneficiariesTable data={beneficiaries} initialFilter={initialFilter} />
    </div>
  )
}
