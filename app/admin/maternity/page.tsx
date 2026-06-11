import Link from 'next/link'
import { Plus, Baby } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import Button from '@/components/ui/Button'
import MaternityTable from './MaternityTable'

async function getMaternityAids(): Promise<MaternityAid[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maternity_aids')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count), card_center:card_centers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export default async function MaternityPage() {
  const aids = await getMaternityAids()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">יולדות</h1>
          <p className="text-sm text-slate-500 mt-0.5">כל הלידות · {aids.length}</p>
        </div>
        <Link href="/admin/maternity/new">
          <Button>
            <Plus size={16} />
            לידה חדשה
          </Button>
        </Link>
      </div>

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Baby size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">לא נמצאו תיקי יולדות</p>
        </div>
      ) : (
        <MaternityTable data={aids} showCard />
      )}
    </div>
  )
}
