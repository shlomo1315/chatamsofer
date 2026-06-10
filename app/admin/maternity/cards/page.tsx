import { UtensilsCrossed } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { MaternityAid } from '@/types'
import CardCentersManager from './CardCentersManager'
import CardsTable from './CardsTable'

async function getAids(): Promise<MaternityAid[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('maternity_aids')
      .select('id, birth_date, baby_name, baby_gender, status, card_status, card_center_id, card_loaded_at, created_at, beneficiary:beneficiaries(full_name, family_name, spouse_name, spouse_id_number), card_center:card_centers(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    return (data ?? []) as unknown as MaternityAid[]
  } catch {
    return []
  }
}

export default async function FoodCardsPage() {
  const aids = await getAids()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <UtensilsCrossed size={20} className="text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">כרטיסי מזון יולדות</h1>
          <p className="text-sm text-slate-500 mt-0.5">ניהול מלאי לפי מוקדים ואישור כרטיסים</p>
        </div>
      </div>

      <CardCentersManager />
      <CardsTable aids={aids} />
    </div>
  )
}
