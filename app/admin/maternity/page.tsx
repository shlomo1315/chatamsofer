import Link from 'next/link'
import { Plus, Baby } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import MaternityTable from './MaternityTable'

async function getMaternityAids(): Promise<MaternityAid[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maternity_aids')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count), card_center:card_centers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  const aids = (data ?? []) as MaternityAid[]
  // נפילה-לאחור: רשומות שאין בהן birth_certificate_url — שליפת אישור הלידה מטבלת המסמכים
  const missing = aids.filter(a => !a.birth_certificate_url && a.beneficiary_id)
  if (missing.length) {
    const benIds = [...new Set(missing.map(a => a.beneficiary_id))]
    const { data: docs } = await supabase
      .from('documents')
      .select('beneficiary_id, file_url, uploaded_at')
      .eq('doc_type', 'birth_cert')
      .in('beneficiary_id', benIds)
      .order('uploaded_at', { ascending: false })
    const byBen: Record<string, string> = {}
    for (const d of docs ?? []) if (d.file_url && !byBen[d.beneficiary_id]) byBen[d.beneficiary_id] = d.file_url
    for (const a of aids) if (!a.birth_certificate_url && byBen[a.beneficiary_id]) a.birth_certificate_url = byBen[a.beneficiary_id]
  }
  return aids
}


export default async function MaternityPage() {
  const aids = await getMaternityAids()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="יולדות" subtitle={`כל הלידות · ${aids.length}`}>
        <Link href="/admin/maternity/new">
          <Button>
            <Plus size={16} />
            לידה חדשה
          </Button>
        </Link>
      </PageHeader>

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Baby size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו תיקי יולדות</p>
          <p className="text-slate-400 text-sm mt-1">הוסף תיק יולדת חדש להתחלה</p>
        </div>
      ) : (
        <MaternityTable data={aids} showCard />
      )}
    </div>
  )
}
