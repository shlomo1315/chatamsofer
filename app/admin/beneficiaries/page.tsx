import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import BeneficiariesTable from './BeneficiariesTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'

async function getBeneficiaries(): Promise<Beneficiary[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('beneficiaries')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export default async function BeneficiariesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [beneficiaries, params] = await Promise.all([getBeneficiaries(), searchParams])
  const validFilters = ['all', 'pending', 'approved', 'rejected'] as const
  type Filter = typeof validFilters[number]
  const initialFilter: Filter = validFilters.includes(params.status as Filter) ? (params.status as Filter) : 'all'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="צאצאים" subtitle={`${beneficiaries.length} רשומות`}>
        <ExportExcelButton type="beneficiaries" />
        <Link href="/admin/beneficiaries/new">
          <Button>
            <Plus size={16} />
            רישום צאצא חדש
          </Button>
        </Link>
      </PageHeader>

      <BeneficiariesTable data={beneficiaries} initialFilter={initialFilter} />
    </div>
  )
}
