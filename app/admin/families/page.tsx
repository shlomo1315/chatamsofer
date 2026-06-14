import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Family } from '@/types'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'

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

      {families.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו משפחות</p>
          <p className="text-slate-400 text-sm mt-1">הוסף משפחה חדשה להתחלה</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {families.map((family) => (
            <Link key={family.id} href={`/admin/families/${family.id}`}>
              <Card className="hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                      {family.family_name}
                    </h3>
                    {family.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{family.notes}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 text-xs font-medium">
                    <Users size={12} />
                    {family.member_count}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
