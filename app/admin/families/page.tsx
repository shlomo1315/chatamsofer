import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Family } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import FamiliesClient from './FamiliesClient'
import { AdminOnly } from '@/components/StaffPermissions'

async function getFamilies(): Promise<(Family & { member_count: number })[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // ספירת חברי המשפחה מחושבת ב-DB (aggregate) במקום למשוך את כל שורות ה-id ולספור ב-JS.
  const { data, error } = await supabase
    .from('families')
    .select('*, beneficiaries(count)')
    .order('family_name')
  if (error) throw error
  return (data ?? []).map((f) => ({
    ...f,
    member_count: (f.beneficiaries as { count: number }[] | null)?.[0]?.count ?? 0,
    beneficiaries: undefined,
  }))
}

export default async function FamiliesPage() {
  const families = await getFamilies()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="משפחות" subtitle={`${families.length} משפחות רשומות`}>
        <AdminOnly>
          <Button>
            <Plus size={16} />
            משפחה חדשה
          </Button>
        </AdminOnly>
      </PageHeader>

      <FamiliesClient families={families} />
    </div>
  )
}
