import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary, WidowRequest, WidowSupportPayment } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import WidowsDashboard from './WidowsDashboard'
import ExportExcelButton from '@/components/admin/ExportExcelButton'

async function getData(): Promise<{ widows: Beneficiary[]; requests: WidowRequest[]; payments: WidowSupportPayment[] }> {
  if (!isSupabaseConfigured()) return { widows: [], requests: [], payments: [] }
  const supabase = await createClient()
  const [widowsRes, requestsRes, paymentsRes] = await Promise.all([
    supabase
      .from('beneficiaries')
      .select('*')
      .in('marital_status', ['אלמן', 'אלמנה'])
      .order('created_at', { ascending: false }),
    supabase
      .from('widow_requests')
      .select('*, beneficiary:beneficiaries(full_name,family_name,id_number)')
      .order('created_at', { ascending: false }),
    supabase
      .from('widow_support_payments')
      .select('*')
      .order('paid_at', { ascending: false }),
  ])
  if (widowsRes.error) throw widowsRes.error
  // טבלאות האלמנות עשויות שלא להתקיים בסביבת פיתוח — מתעלמים רק מ"טבלה לא קיימת"
  if (requestsRes.error && requestsRes.error.code !== '42P01') throw requestsRes.error
  if (paymentsRes.error && paymentsRes.error.code !== '42P01') throw paymentsRes.error
  return {
    widows: widowsRes.data ?? [],
    requests: (requestsRes.data as WidowRequest[]) ?? [],
    payments: (paymentsRes.data as WidowSupportPayment[]) ?? [],
  }
}

export default async function WidowsPage() {
  const { widows, requests, payments } = await getData()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="אגף אלמנות ויתומים" subtitle={`${widows.length} תיקי משפחות`}>
        <ExportExcelButton type="widows" />
      </PageHeader>
      <WidowsDashboard widows={widows} requests={requests} payments={payments} />
    </div>
  )
}
