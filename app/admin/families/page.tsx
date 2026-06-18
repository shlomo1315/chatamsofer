import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Family } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import FamiliesClient from './FamiliesClient'

async function getFamilies(): Promise<(Family & { member_count: number })[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('families')
    .select('*, beneficiaries(id)')
    .order('family_name')
  if (error) throw error
  return (data ?? []).map((f) => ({
    ...f,
    member_count: (f.beneficiaries as { id: string }[]).length,
    beneficiaries: undefined,
  }))
}

export default async function FamiliesPage() {
  const families = await getFamilies()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="משפחות" subtitle={`${families.length} משפחות רשומות`}>
        <Button>
          <Plus size={16} />
          משפחה חדשה
        </Button>
      </PageHeader>

      <FamiliesClient families={families} />
    </div>
  )
}
