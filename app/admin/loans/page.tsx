import { guardPage } from '@/lib/pageGuard'
import Link from 'next/link'
import { Plus, CreditCard, ExternalLink } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import LoansTable from './LoansTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import LoansPortalEmailButton from './LoansPortalEmailButton'
import { AdminOnly } from '@/components/StaffPermissions'
import { AWAITING_RABBI_FORM } from '@/lib/openLoanGuard'

async function getLoans(): Promise<Loan[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // ⚡ עמודות מפורשות במקום select('*'): הרשימה משכה לכל הלוואה שדות טקסט
  // כבדים שאינם מוצגים בטבלה — declaration (נוסח ההצהרה המלא), purpose_details,
  // notes ו-document_urls (JSON של כל הקבצים) — כפול כל השורות בכל טעינת דף.
  const { data, error } = await supabase
    .from('loans')
    // ⚠️ status + amount + approved_amount: לא רק לתצוגה — LoanStatusControl
    // (LoanControls.tsx) מקבל את אובייקט ה-loan ומשתמש בהם בפועל: amount הוא
    // תקרת "הסכום שאושר" במודל האישור, approved_amount הוא ערך ברירת המחדל בו,
    // ו-status הוא מצב הפתיחה + הגלגול-לאחור בכשל עדכון.
    // ⚠️ id: גם למפתח השורה, גם לניווט, וגם ל-DeleteLoanButton ולקריאות ה-API.
    .select('id, amount, approved_amount, installments, purpose, status, disbursed_at, disbursed_by, created_at, beneficiary:beneficiaries(full_name, family_name, id_number, spouse_name, spouse_id_number)')
    // 🔴 טיוטות שממתינות לטופס חתימת רב אינן בקשות שהוגשו, ולכן אינן
    // מוצגות כאן כלל. הן נוצרות ברגע שהמבקש מוריד את הטופס — לפני שהוא
    // החתים רב והחזיר אותו — וכניסתן לרשימה הייתה מציגה למזכיר תיקים
    // שאיש לא ביקש ממנו לטפל בהם, ומנפחת את מוני "ממתין לטיפול".
    .neq('status', AWAITING_RABBI_FORM)
    .order('created_at', { ascending: false })
  if (error) throw error
  // ⚡ ה-select מצומצם בכוונה (ראו למעלה) ולכן ה-cast דרך unknown: שדות שאינם
  // בשימוש בטבלה הושמטו מהשליפה כדי לצמצם את ה-payload.
  return (data ?? []) as unknown as Loan[]
}

/**
 * לכל בקשה שבבירור — האם המבקש כבר השיב.
 * ההודעה האחרונה בשרשור קובעת: 'staff' = ממתינים לתשובתו, 'applicant' = הוא
 * השיב וממתין לטיפולנו. זה מה שמפריד את שתי הקבוצות בקובייה "בתהליך בירור".
 */
async function getReplied(): Promise<string[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // ⚡ אין יותר תלות ברשימת ה-IDs מ-getLoans — הסינון ל"בבירור" נעשה ב-DB דרך
  // join פנימי על ההלוואה (loans!inner). כך שתי השאילתות רצות ב-Promise.all
  // במקבץ אחד במקום בטור, ומחצית מזמן ההמתנה של הדף נחסכת.
  // ⚠️ created_at לא נשלף אלא רק ממיין: ה-JS קורא רק loan_id+direction, וה-Map
  // שומר את האחרון בסדר העולה — כלומר את ההודעה האחרונה בשרשור.
  const { data } = await supabase
    .from('loan_messages')
    .select('loan_id, direction, loans!inner(status)')
    .eq('loans.status', 'inquiry')
    .order('created_at', { ascending: true })

  const last = new Map<string, string>()
  for (const m of data ?? []) last.set(String(m.loan_id), String(m.direction))
  return [...last.entries()].filter(([, dir]) => dir === 'applicant').map(([id]) => id)
}

export default async function LoansPage() {
  await guardPage('loans')
  // ⚡ במקביל ולא בטור — getReplied כבר לא צריך את ה-IDs מ-getLoans (ראו שם)
  const [loans, replied] = await Promise.all([getLoans(), getReplied()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הלוואות" subtitle={`${loans.length} הלוואות`}>
        <ExportExcelButton type="loans" />
        <Link href="/shared/loans" target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">
            <ExternalLink size={16} />
            פורטל ביצוע
          </Button>
        </Link>
        <LoansPortalEmailButton />
        <AdminOnly>
          <Link href="/admin/loans/new">
            <Button>
              <Plus size={16} />
              הלוואה חדשה
            </Button>
          </Link>
        </AdminOnly>
      </PageHeader>

      {loans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו הלוואות</p>
          <p className="text-slate-400 text-sm mt-1">הוסף הלוואה חדשה להתחלה</p>
        </div>
      ) : (
        <LoansTable data={loans} repliedIds={replied} />
      )}
    </div>
  )
}
