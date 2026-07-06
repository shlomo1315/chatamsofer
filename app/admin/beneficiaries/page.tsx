import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import BeneficiariesTable from './BeneficiariesTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import { AdminOnly } from '@/components/StaffPermissions'

// רק העמודות שטבלת הרשימה מציגה/ממיינת/מחפשת בהן — משמיט שדות כבדים (children JSON,
// lineage_chain, lineage_manual וכו') מה-payload. כרטיס המוטב וייצוא האקסל מושכים את הנתונים המלאים בנפרד.
const LIST_COLUMNS =
  'id, created_at, full_name, family_name, id_number, phone, phone2, email, address, city, ' +
  'marital_status, spouse_name, spouse_id_number, nedarim_id, notes, children_count, eligibility_status, is_active'

async function getBeneficiaries(): Promise<Beneficiary[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('beneficiaries')
    .select(LIST_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Beneficiary[]
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
        <AdminOnly>
          <Link href="/admin/beneficiaries/new">
            <Button>
              <Plus size={16} />
              רישום צאצא חדש
            </Button>
          </Link>
        </AdminOnly>
      </PageHeader>

      <BeneficiariesTable data={beneficiaries} initialFilter={initialFilter} />
    </div>
  )
}
