import Link from 'next/link'
import { GitBranch } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { FamilyRelation } from '@/types'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import { RELATION_TYPES } from '@/types'

async function getRelations(): Promise<FamilyRelation[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('family_relations')
    .select('*, person:beneficiaries!person_id(id, full_name, eligibility_status), related_person:beneficiaries!related_person_id(id, full_name, eligibility_status)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export default async function GenealogyPage() {
  const relations = await getRelations()

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="יוחסין"
        subtitle="מערכת יחסי משפחה ואימות זכאות"
      >
        <button className="flex items-center gap-2 bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <GitBranch size={16} />
          הוסף קשר משפחתי
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'קשרים מאומתים', value: relations.filter((r) => r.document_verified).length, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
          { label: 'ממתינים לאימות', value: relations.filter((r) => !r.document_verified).length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
          { label: 'סה״כ קשרים', value: relations.length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl p-5 text-center`}>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <Card padding="none">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">קשרים משפחתיים</h2>
        </div>
        {relations.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GitBranch size={28} className="text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm font-medium">לא נמצאו קשרים משפחתיים</p>
            <p className="text-slate-400 text-xs mt-1">הוסף קשר משפחתי ראשון כדי להתחיל</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {relations.map((rel) => (
              <div key={rel.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  {rel.person && (
                    <Link href={`/admin/beneficiaries/${rel.person.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      {(rel.person as { full_name: string }).full_name}
                    </Link>
                  )}
                  <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 font-medium">{rel.relation_type}</span>
                  {rel.related_person && (
                    <Link href={`/admin/beneficiaries/${rel.related_person.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      {(rel.related_person as { full_name: string }).full_name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {rel.document_verified ? (
                    <span className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-full px-2.5 py-0.5 font-medium">מאומת</span>
                  ) : (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5 font-medium">ממתין לאימות</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">סוגי קשרים נתמכים</h2>
        <div className="flex flex-wrap gap-2">
          {RELATION_TYPES.map((type) => (
            <span key={type} className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
              {type}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}
