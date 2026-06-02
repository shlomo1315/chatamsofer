import Link from 'next/link'
import { ArrowRight, Users, Plus } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Family, Beneficiary } from '@/types'
import Card from '@/components/ui/Card'
import StatusBadge from '@/components/ui/StatusBadge'
import { GENDER_LABELS } from '@/types'

async function getFamily(id: string): Promise<(Family & { beneficiaries: Beneficiary[] }) | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('families')
      .select('*, beneficiaries(*)')
      .eq('id', id)
      .single()
    return data
  } catch {
    return null
  }
}

export default async function FamilyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const family = await getFamily(id)

  if (!family && isSupabaseConfigured()) notFound()

  if (!family) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin/families" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <h1 className="text-xl font-bold text-slate-900">פרטי משפחה</h1>
        </div>
        <div className="bg-white rounded-xl border p-8 text-center text-slate-400">
          נתונים לא זמינים — הגדר Supabase לצפייה.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/families" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{family.family_name}</h1>
            <p className="text-sm text-slate-500">{family.beneficiaries.length} חברי משפחה</p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors">
          <Plus size={14} />
          הוסף חבר
        </button>
      </div>

      {family.notes && (
        <Card>
          <p className="text-sm text-slate-700">{family.notes}</p>
        </Card>
      )}

      <Card padding="none">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <Users size={16} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">חברי משפחה</h2>
        </div>
        {family.beneficiaries.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            אין חברי משפחה רשומים
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {family.beneficiaries.map((b) => (
              <div key={b.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                    {b.full_name.charAt(0)}
                  </div>
                  <div>
                    <Link href={`/admin/beneficiaries/${b.id}`} className="text-sm font-medium text-slate-800 hover:text-indigo-600">
                      {b.full_name}
                    </Link>
                    <p className="text-xs text-slate-400 ltr-num">{b.id_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {b.gender && <span className="text-xs text-slate-500">{GENDER_LABELS[b.gender]}</span>}
                  <StatusBadge status={b.eligibility_status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
