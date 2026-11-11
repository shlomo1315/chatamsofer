import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import FinancialAidClient, { type AidRow } from './FinancialAidClient'

async function getRequests(): Promise<AidRow[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // הכרטסת מציגה את כל פרטי הבקשה (משפחה, הכנסות, תשובת המנהל, מסמכים),
  // ולכן נשלפת השורה המלאה. בלי המסמכים אם הקשר לטבלה חסר.
  const run = (docs: boolean) => supabase
    .from('financial_aid_requests')
    .select(`*, beneficiary:beneficiaries(*)${docs ? ', documents:financial_aid_documents(*)' : ''}`)
    .order('created_at', { ascending: false })
  let { data, error } = await run(true)
  if (error) ({ data, error } = await run(false))
  if (error) throw error
  return (data ?? []) as unknown as AidRow[]
}

export default async function FinancialAidPage() {
  await guardPage('financial_aid')
  const requests = await getRequests()
  return (
    <div className="aidui -m-5 lg:-m-6 p-5 lg:p-6 pb-16 min-h-screen" dir="rtl">
      <FinancialAidClient requests={requests} />
    </div>
  )
}
