import { Heart } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import MaternityTable from '../MaternityTable'

async function getSilentAids(): Promise<MaternityAid[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maternity_aids')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count), card_center:card_centers(name)')
    .eq('birth_type', 'silent') // רק לידות שקטות — סינון ב-DB במקום משיכת הכל וזריקה ב-JS
    .order('created_at', { ascending: false })
  if (error) throw error
  const aids = (data ?? []) as MaternityAid[]
  // נפילה-לאחור: שליפת אישור הלידה מטבלת המסמכים עבור רשומות ללא birth_certificate_url
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

export default async function SilentBirthPage() {
  const aids = await getSilentAids()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="לידה שקטה" subtitle={`בקשות לאחר לידה שקטה · ${aids.length}`} />

      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
        בקשות אלו הוגשו בדיסקרטיה — ללא פרטי תינוק (שם / ת.ז). פרטי האם נלקחים מהרישום הקיים, ומצורף מסמך אישור בלבד.
      </div>

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Heart size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו בקשות לאחר לידה שקטה</p>
        </div>
      ) : (
        <MaternityTable data={aids} />
      )}
    </div>
  )
}
