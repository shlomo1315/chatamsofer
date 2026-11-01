import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { FinancialAidRequest } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import FinancialAidClient from './FinancialAidClient'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import { APPROVAL_LABEL_SELECT } from '@/lib/approvalLabel'

async function getRequests(): Promise<FinancialAidRequest[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // ⚡ עמודות מפורשות במקום select('*'): הרשימה משכה לכל בקשה את גוף תשובת
  // הגורם המאשר (decision_reply — מייל שלם), את notes, ואת מזהי ה-Gmail
  // (gmail_thread_id/gmail_message_id) ו-document_url — שדות שאינם מוצגים
  // בטבלה כלל ונחוצים רק בדף הבקשה הבודדת (/admin/financial-aid/[id]).
  // ⚠️ שתי גרסאות — עם תווית סיבת האישור ובלעדיה, כי ה-join אינו קיים עד
  // שהמיגרציה רצה, והשגיאה כאן זורקת ומפילה את כל המסך.
  const run = (benFields: string, extra = ', applicant_name, applicant_id_number, is_descendant, requested_amount, beneficiary_id, aid_type, relation, referrer') => supabase
    .from('financial_aid_requests')
    // ⚠️ amount נשלף אף שהוא מוצג רק במאושרות — התא מציג fmtCur(r.amount)
    // לפי r.status, ובלעדיו כל בקשה מאושרת תראה "—" במקום הסכום.
    // ⚠️ id: מפתח השורה, הניווט לדף הבקשה, וגם המחיקה מהטבלה (del()).
    // ⚠️ בנתמך: spouse_name ו-phone הוסרו — name() בונה שם מ-family_name+
    // full_name בלבד, והחיפוש נוגע רק ב-id_number/spouse_id_number.
    .select(`id, reason, status, amount, created_at${extra}, beneficiary:beneficiaries(${benFields})`)
    .order('created_at', { ascending: false })

  const BEN_BASE = 'id, full_name, family_name, id_number, spouse_id_number'
  let { data, error } = await run(`${BEN_BASE}, ${APPROVAL_LABEL_SELECT}`)
  if (error) {
    console.error('[financial-aid] approval label join failed, retrying without it:', error)
    ;({ data, error } = await run(BEN_BASE))
  }
  // המיגרציה של הטופס הציבורי טרם רצה — בלי עמודות המבקש
  // המיגרציה של מחלקת סיוע טרם רצה — בלי סוג/קשר/ממליץ
  if (error) ({ data, error } = await run(BEN_BASE, ', applicant_name, applicant_id_number, is_descendant, requested_amount, beneficiary_id'))
  if (error) ({ data, error } = await run(BEN_BASE, ''))
  if (error) throw error
  // ⚡ ה-select מצומצם בכוונה (ראו למעלה) ולכן ה-cast דרך unknown
  const rows = (data ?? []) as unknown as FinancialAidRequest[]
  // הודעות שלא נקראו מהמבקשים (טבלה חדשה; חסרה עד המיגרציה)
  const { data: msgs } = await supabase.from('aid_messages').select('request_id').eq('source_table', 'financial_aid_requests').eq('direction', 'applicant').eq('is_read', false)
  const unread = new Map<string, number>()
  for (const m of (msgs ?? []) as { request_id: string }[]) unread.set(m.request_id, (unread.get(m.request_id) ?? 0) + 1)
  return rows.map(r => ({ ...r, unread: unread.get(r.id) ?? 0 }))
}

export default async function FinancialAidPage() {
  await guardPage('financial_aid')
  const requests = await getRequests()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="מחלקת סיוע" subtitle="סיוע רפואי, אלמנות ויתומים: בקשות, התכתבות ואישור">
        <ExportExcelButton type="financial_aid" />
      </PageHeader>
      <FinancialAidClient requests={requests} />
    </div>
  )
}
