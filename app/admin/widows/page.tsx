import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary, WidowRequest, WidowSupportPayment } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import WidowsDashboard from './WidowsDashboard'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import { APPROVAL_LABEL_SELECT } from '@/lib/approvalLabel'

async function getData(): Promise<{ widows: Beneficiary[]; requests: WidowRequest[]; payments: WidowSupportPayment[]; error: string | null }> {
  if (!isSupabaseConfigured()) return { widows: [], requests: [], payments: [], error: null }
  const supabase = await createClient()
  // ⚡ רק העמודות שהלוח מציג (WidowsDashboard). קודם select('*') משך לכל אלמנה
  // את החתימה בבסיס64 (20-80KB), את children/lineage_chain, ואת עמודות
  // ה-portal_* הרגישות — פי כמה מונים יותר מהנדרש, כפול מספר השורות.
  const WIDOW_BASE = 'id, full_name, family_name, id_number, city, children_count, monthly_support, created_at'
  const runWidows = (fields: string) => supabase
    .from('beneficiaries')
    .select(fields)
    .in('marital_status', ['אלמן', 'אלמנה'])
    .order('created_at', { ascending: false })

  const [widowsRes, requestsRes, paymentsRes] = await Promise.all([
    // ⚠️ תווית סיבת האישור בנפילה-לאחור: אם ה-join אינו קיים (המיגרציה טרם
    // רצה) הרשימה נשלפת בלעדיו, במקום להישאר ריקה עם באנר שגיאה.
    runWidows(`${WIDOW_BASE}, ${APPROVAL_LABEL_SELECT}`)
      .then(r => r.error ? runWidows(WIDOW_BASE) : r),
    // ⚠️ הבקשות משמשות בלוח *רק לספירה מצטברת* — pendingByFamily (תג "N בקשות"
    // ליד שם המשפחה) והמונה העליון. אין תצוגת שורת בקשה, ולכן description,
    // notes, amount, request_type והנתמך המקושר נשלפו לחינם. פרטי הבקשה
    // נשלפים ממילא בדף התיק הבודד (/admin/widows/[id]).
    supabase
      .from('widow_requests')
      .select('beneficiary_id, status')
      .order('created_at', { ascending: false }),
    // ⚠️ אותו סיפור בתמיכות: totalsByFamily ו"סך תמיכות כללי" סוכמים amount
    // לפי beneficiary_id בלבד. note/type/paid_at/id אינם מוצגים בלוח.
    // (ה-order לפי paid_at נשמר — לא משנה לסכימה, אך שומר על סדר עקבי.)
    supabase
      .from('widow_support_payments')
      .select('beneficiary_id, amount')
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
  // ⚡ ה-selects מצומצמים בכוונה (ראו למעלה) ולכן ה-casts דרך unknown
  return {
    widows: (widowsRes.data ?? []) as unknown as Beneficiary[],
    requests: (requestsRes.data ?? []) as unknown as WidowRequest[],
    payments: (paymentsRes.data ?? []) as unknown as WidowSupportPayment[],
    error,
  }
}

export default async function WidowsPage() {
  await guardPage('widows')
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
