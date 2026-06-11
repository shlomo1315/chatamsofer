import { HandCoins } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { FinancialAidRequest } from '@/types'
import FinancialAidClient from './FinancialAidClient'

async function getRequests(): Promise<FinancialAidRequest[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('financial_aid_requests')
      .select('*, beneficiary:beneficiaries(id, full_name, family_name, id_number, spouse_name, spouse_id_number, phone)')
      .order('created_at', { ascending: false })
    return data ?? []
  } catch {
    return []
  }
}

export default async function FinancialAidPage() {
  const requests = await getRequests()
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <HandCoins size={20} className="text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">סיוע רפואי</h1>
          <p className="text-sm text-slate-500 mt-0.5">בקשות סיוע ואישור דרך הגורם המאשר</p>
        </div>
      </div>
      <FinancialAidClient requests={requests} />
    </div>
  )
}
