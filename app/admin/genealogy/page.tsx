import Link from 'next/link'
import { GitBranch, Search, Users } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { FamilyRelation } from '@/types'
import Card from '@/components/ui/Card'
import StatusBadge from '@/components/ui/StatusBadge'
import { RELATION_TYPES } from '@/types'

async function getRelations(): Promise<FamilyRelation[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('family_relations')
      .select('*, person:beneficiaries!person_id(id, full_name, eligibility_status), related_person:beneficiaries!related_person_id(id, full_name, eligibility_status)')
      .order('created_at', { ascending: false })
    return data ?? []
  } catch {
    return []
  }
}

export default async function GenealogyPage() {
  const relations = await getRelations()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">יוחסין</h1>
          <p className="text-sm text-slate-500 mt-0.5">מערכת יחסי משפחה ואימות זכאות</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors">
          <GitBranch size={16} />
          הוסף קשר משפחתי
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'קשרים מאומתים', value: relations.filter((r) => r.document_verified).length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'ממתינים לאימות', value: relations.filter((r) => !r.document_verified).length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'סה״כ קשרים', value: relations.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <Card padding="none">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">קשרים משפחתיים</h2>
        </div>
        {relations.length === 0 ? (
          <div className="p-12 text-center">
            <GitBranch size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400 text-sm">לא נמצאו קשרים משפחתיים</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {relations.map((rel) => (
              <div key={rel.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50">
                <div className="flex-1 flex items-center gap-2">
                  {rel.person && (
                    <Link href={`/admin/beneficiaries/${rel.person.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      {(rel.person as { full_name: string }).full_name}
                    </Link>
                  )}
                  <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{rel.relation_type}</span>
                  {rel.related_person && (
                    <Link href={`/admin/beneficiaries/${rel.related_person.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      {(rel.related_person as { full_name: string }).full_name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {rel.document_verified ? (
                    <span className="text-xs text-green-600 bg-green-50 rounded-full px-2 py-0.5 font-medium">מאומת</span>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 font-medium">ממתין לאימות</span>
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
            <span key={type} className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1">
              {type}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}
