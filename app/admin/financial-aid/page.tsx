import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { FinancialAidRequest } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import FinancialAidClient from './FinancialAidClient'
import ExportExcelButton from '@/components/admin/ExportExcelButton'

async function getRequests(): Promise<FinancialAidRequest[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // ⚡ עמודות מפורשות במקום select('*'): הרשימה משכה לכל בקשה את גוף תשובת
  // הגורם המאשר (decision_reply — מייל שלם), את notes, ואת מזהי ה-Gmail
  // (gmail_thread_id/gmail_message_id) ו-document_url — שדות שאינם מוצגים
  // בטבלה כלל ונחוצים רק בדף הבקשה הבודדת (/admin/financial-aid/[id]).
  const { data, error } = await supabase
    .from('financial_aid_requests')
    // ⚠️ amount נשלף אף שהוא מוצג רק במאושרות — התא מציג fmtCur(r.amount)
    // לפי r.status, ובלעדיו כל בקשה מאושרת תראה "—" במקום הסכום.
    // ⚠️ id: מפתח השורה, הניווט לדף הבקשה, וגם המחיקה מהטבלה (del()).
    // ⚠️ בנתמך: spouse_name ו-phone הוסרו — name() בונה שם מ-family_name+
    // full_name בלבד, והחיפוש נוגע רק ב-id_number/spouse_id_number.
    .select('id, reason, status, amount, created_at, beneficiary:beneficiaries(id, full_name, family_name, id_number, spouse_id_number)')
    .order('created_at', { ascending: false })
  if (error) throw error
  // ⚡ ה-select מצומצם בכוונה (ראו למעלה) ולכן ה-cast דרך unknown
  return (data ?? []) as unknown as FinancialAidRequest[]
}

export default async function FinancialAidPage() {
  const requests = await getRequests()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="סיוע רפואי" subtitle="בקשות סיוע ואישור דרך הגורם המאשר">
        <ExportExcelButton type="financial_aid" />
      </PageHeader>
      <FinancialAidClient requests={requests} />
    </div>
  )
}
