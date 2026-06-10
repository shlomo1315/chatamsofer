import { Baby } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import RecoveryHomesView from './RecoveryHomesView'

const DEFAULT_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

async function getData(): Promise<{ aids: MaternityAid[]; homes: string[] }> {
  if (!isSupabaseConfigured()) return { aids: [], homes: DEFAULT_HOMES }
  try {
    const supabase = await createClient()
    const [aidsRes, homesRes] = await Promise.all([
      supabase
        .from('maternity_aids')
        .select('*, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count)')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase.from('recovery_homes').select('name'),
    ])
    const homes = Array.from(new Set([...DEFAULT_HOMES, ...((homesRes.data ?? []).map(h => h.name as string))]))
    return { aids: aidsRes.data ?? [], homes }
  } catch {
    return { aids: [], homes: DEFAULT_HOMES }
  }
}

export default async function RecoveryPage() {
  const { aids, homes } = await getData()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Baby size={20} className="text-pink-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">עזר יולדות</h1>
          <p className="text-sm text-slate-500 mt-0.5">בית החלמה · לפי מוקד וסטטוס פעילות</p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
        מוצגות כאן רק לידות שאושרו. כדי לאשר לידות חדשות יש להיכנס לשונית הראשית <strong>יולדות</strong>.
      </div>

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Baby size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">לא נמצאו תיקי יולדות</p>
        </div>
      ) : (
        <RecoveryHomesView aids={aids} homes={homes} />
      )}
    </div>
  )
}
