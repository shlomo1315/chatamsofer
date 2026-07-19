import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary, WidowRequest, WidowSupportPayment } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import WidowsDashboard from './WidowsDashboard'
import ExportExcelButton from '@/components/admin/ExportExcelButton'

async function getData(): Promise<{ widows: Beneficiary[]; requests: WidowRequest[]; payments: WidowSupportPayment[]; error: string | null }> {
  if (!isSupabaseConfigured()) return { widows: [], requests: [], payments: [], error: null }
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
  // לא מקריסים את כל הדף על שגיאה — מציגים מה שכן נטען + הודעה. טבלאות
  // אלמנות עשויות שלא להתקיים (42P01), ושגיאות אחרות מדווחות אך לא חוסמות.
  let error: string | null = null
  if (widowsRes.error) {
    console.error('[widows] beneficiaries query failed:', JSON.stringify(widowsRes.error))
    error = `שגיאה בטעינת תיקי המשפחות: ${widowsRes.error.message}`
  }
  if (requestsRes.error && requestsRes.error.code !== '42P01') {
    console.error('[widows] widow_requests query failed:', JSON.stringify(requestsRes.error))
    error ??= `שגיאה בטעינת הבקשות: ${requestsRes.error.message}`
  }
  if (paymentsRes.error && paymentsRes.error.code !== '42P01') {
    console.error('[widows] widow_support_payments query failed:', JSON.stringify(paymentsRes.error))
    error ??= `שגיאה בטעינת התמיכות: ${paymentsRes.error.message}`
  }
  return {
    widows: (widowsRes.data as Beneficiary[]) ?? [],
    requests: (requestsRes.data as WidowRequest[]) ?? [],
    payments: (paymentsRes.data as WidowSupportPayment[]) ?? [],
    error,
  }
}

export default async function WidowsPage() {
  const { widows, requests, payments, error } = await getData()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="אגף אלמנות ויתומים" subtitle={`${widows.length} תיקי משפחות`}>
        <ExportExcelButton type="widows" />
      </PageHeader>
      {error && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      <WidowsDashboard widows={widows} requests={requests} payments={payments} />
    </div>
  )
}
