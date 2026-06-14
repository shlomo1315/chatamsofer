import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { FinancialAidRequest } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import FinancialAidClient from './FinancialAidClient'

async function getRequests(): Promise<FinancialAidRequest[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financial_aid_requests')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, id_number, spouse_name, spouse_id_number, phone)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export default async function FinancialAidPage() {
  const requests = await getRequests()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="סיוע רפואי" subtitle="בקשות סיוע ואישור דרך הגורם המאשר" />
      <FinancialAidClient requests={requests} />
    </div>
  )
}
