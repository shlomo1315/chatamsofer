import { guardPage } from '@/lib/pageGuard'
import Link from 'next/link'
import { ArrowRight, CreditCard, FileText, Edit, CheckCircle2, Clock, ExternalLink, Users, MessageSquare, Banknote } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import { docViewUrl } from '@/lib/docUrl'
import { docTypeLabel } from '@/lib/docTypes'
import { loanSourceLabel } from '@/lib/loanSubmissionSource'
import LoanDecisionPanel from './LoanDecisionPanel'
import { ViewDocButton } from '@/components/ui/DocViewer'
import DocThumb from '@/components/ui/DocThumb'
import SafeDocImage from '@/components/ui/SafeDocImage'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import { groupDocsByType } from '@/lib/groupDocsByType'
import DownloadDocButton from '@/components/ui/DownloadDocButton'
import Card from '@/components/ui/Card'
import PriorRejectionAlert from './PriorRejectionAlert'
import { LoanStatusControl, DeleteLoanButton } from '../LoanControls'
import FamilyApprovalGate from '@/components/admin/FamilyApprovalGate'
import BackButton from '@/components/ui/BackButton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import FamilySummary from './FamilySummary'
import LoanInquiryPanel from './LoanInquiryPanel'
import ApprovalLabelTag from '@/components/ui/ApprovalLabelTag'
import { approvalLabelOf } from '@/lib/approvalLabel'

async function getLoan(id: string): Promise<Loan | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  // ⚠️ שתי מחרוזות select מפורשות ולא תבנית עם משתנה: הטיפוסים של
  // supabase-js נגזרים מהמחרוזת *הליטרלית*, ואינטרפולציה הופכת אותה ל-
  // `${string}` — מה שמבטל את הסקת הטיפוס ומחזיר ParserError.
  const run = (withLabel: boolean) => withLabel
    ? supabase.from('loans')
        .select('*, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, spouse_id_number, id_number, email, phone, address, city, marital_status, children_count, eligibility_status, lineage_chain, approval_label:approval_labels(id, name, color, notes))')
        .eq('id', id).single()
    : supabase.from('loans')
        .select('*, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, spouse_id_number, id_number, email, phone, address, city, marital_status, children_count, eligibility_status, lineage_chain)')
        .eq('id', id).single()

  // ⚠️ קודם עם תווית סיבת האישור ובנפילה בלעדיה: ה-join אינו קיים עד
  // שהמיגרציה רצה, והכרטסת חייבת להיפתח גם אז.
  let { data, error } = await run(true)
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') {
    console.error('[loans/:id] approval label join failed, retrying without it:', error)
    ;({ data, error } = await run(false))
  }
  // לא נמצא (PGRST116) או מזהה לא תקין (22P02) → notFound; שאר השגיאות מופצות הלאה
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  return data
}

/**
 * מסמכי המשפחה המוצגים בכרטסת ההלוואה.
 *
 * 🔴 היה כאן `.in()` על ארבעה סוגי ת"ז בלבד, ולכן כל מסמך אחר שהמבקש
 * העלה — ובראשו **טופס אישור רב** — סונן החוצה בשקט. המסמך נשמר במערכת
 * כראוי אך לא היה דרך לראותו, וזה בדיוק המסמך שההחלטה נשענת עליו.
 *
 * ⚠️ אין סינון סוגים: כל מה שצורף לתיק שייך לכרטסת. סוג חדש שיתווסף
 * בעתיד יופיע מאליו, במקום להיעלם עד שמישהו יזכור להוסיפו לרשימה.
 *
 * ⚠️ הכפילות אינה מסוננת עוד — ריבוי קבצים לאותו סוג הוא מצב נתמך
 * (אדם עם שני עמודי ת"ז), ושמירת האחרון בלבד הסתירה קבצים אמיתיים.
 */
async function getBeneficiaryDocs(beneficiaryId: string): Promise<{ doc_type: string; file_url: string | null; file_name: string | null }[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('doc_type, file_url, file_name')
    .eq('beneficiary_id', beneficiaryId)
    .order('uploaded_at', { ascending: false })
  return (data ?? []).filter(d => d.file_url)
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'
const fmtCur = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('he-IL')}`

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await guardPage('loans')
  const { id } = await params
  const loan = await getLoan(id)
  const beneficiaryId = (loan?.beneficiary as { id?: string } | undefined)?.id
  const famDocs = beneficiaryId ? await getBeneficiaryDocs(beneficiaryId) : []

  if (!loan && isSupabaseConfigured()) notFound()

  if (!loan) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin/loans" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <h1 className="text-xl font-bold">פרטי הלוואה</h1>
        </div>
        <div className="bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>
      </div>
    )
  }

  const b = loan.beneficiary as (Parameters<typeof FamilyApprovalGate>[0]['beneficiary'] & { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; phone?: string; email?: string; eligibility_status?: string }) | undefined
  const familyApproved = b?.eligibility_status === 'approved'
  // הלווה = הבעל (full_name); אם אין בעל, האישה (spouse_name)
  const borrower = b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || b.full_name) : undefined

  // ⚠️ הגלריה כוללת גם את המסמכים המצורפים וגם את צילומי הת"ז: מבחינת
  // המזכירות זו רשימה אחת שעוברים עליה, וההפרדה לשני כרטיסים היא תצוגה
  // בלבד. גלריות נפרדות היו עוצרות את הניווט באמצע.
  // ── מסמכי התיק, מסודרים לפי מקור ──
  //
  // 🔴 טופס אישור רב נשמר בשלושה מקומות שונים לפי מסלול ההגשה:
  // `loans.rabbi_form_url` (פורטל ומייל), טבלת `documents` עם
  // doc_type='rabbi_form' (העלאה מהפורטל), ולעיתים ב-document_urls.
  // אף אחד משלושתם לא הוצג — המסמך שההחלטה נשענת עליו היה בלתי נגיש.
  const ID_LABELS: Record<string, string> = {
    id_husband: 'ת.ז. הבעל', id_husband_appx: 'ספח ת.ז. הבעל',
    id_wife: 'ת.ז. האישה', id_wife_appx: 'ספח ת.ז. האישה',
  }
  const idDocs = famDocs.filter(d => d.doc_type in ID_LABELS)
  // ⚠️ ת"ז מול ספח — שתי קבוצות בעלות משקל שונה בתצוגה: הת"ז הן מה
  // שמסתכלים עליו, הספח הוא אימות משני. הפרדה כאן ולא ב-CSS, כדי שהסדר
  // (בעל, אישה, ואז הספחים) יהיה קבוע ולא תלוי בסדר ההעלאה למסד.
  const ID_ORDER = ['id_husband', 'id_wife', 'id_husband_appx', 'id_wife_appx']
  const byIdOrder = (a: { doc_type: string }, b: { doc_type: string }) =>
    ID_ORDER.indexOf(a.doc_type) - ID_ORDER.indexOf(b.doc_type)
  // 🔴 כרטיס אחד לכל *סוג* מסמך, לא לכל קובץ.
  //
  // ⚠️ ת"ז דו-צדדית מועלית כשני קבצים באותו doc_type, והצגתם כשני
  // כרטיסים נראית ככפילות. אותו כלל בדיוק חל בכרטסת המוטב ובלידות —
  // המשתמש ביקש במפורש שהתצוגה תהיה זהה בכל המסכים.
  //
  // ⚠️ הקבצים אינם ממוזגים פיזית: מיזוג PDF נכשל על סריקה חריגה
  // ומאבד את המסמך. הכרטיס מציג את הראשון, והגלריה נותנת את השאר.
  const firstOfType = <T extends { doc_type: string; file_url: string | null; file_name: string | null }>(rows: T[]): T[] =>
    groupDocsByType(rows).map(g => g.files[0] as T)

  const idPrimary = firstOfType(idDocs.filter(d => !d.doc_type.endsWith('_appx')).sort(byIdOrder))
  const idAppendix = firstOfType(idDocs.filter(d => d.doc_type.endsWith('_appx')).sort(byIdOrder))
  // מספר הקבצים בכל סוג — לתווית "N עמודים".
  const pagesOfType: Record<string, number> = {}
  for (const g of groupDocsByType(idDocs)) pagesOfType[g.doc_type] = g.files.length
  // ⚠️ מסמכים שאינם ת"ז — טופס אישור רב, אישורים, כל השאר. עד כה סוננו.
  //
  // 🔴 רשימת *חסימה* צרה ולא רשימת היתר: בדיוק כאן ישבה קודם רשימה קשיחה
  // שהעלימה את טופס אישור הרב (ראה getBeneficiaryDocs). סוג חדש חייב
  // להופיע מאליו — ולכן חוסמים רק את מה שידוע שאינו שייך.
  //
  // 'birth_cert' נוצר מבקשת *לידה* של אותה משפחה ואינו נוגע להלוואה.
  // הוא הופיע בכרטסת כ"אישור לידה" ונראה כאילו צורף לבקשה הזו.
  // המסמך אינו נמחק — הוא נשאר בתיק הלידה ובכרטסת המוטב.
  const NON_LOAN_DOC_TYPES = new Set(['birth_cert'])
  const otherDocs = famDocs.filter(d =>
    !(d.doc_type in ID_LABELS) && d.doc_type !== 'rabbi_form' && !NON_LOAN_DOC_TYPES.has(d.doc_type))
  const rabbiDocs = famDocs.filter(d => d.doc_type === 'rabbi_form')

  // טופס אישור רב מהשדה הייעודי — אם אינו כבר ברשימת המסמכים
  const rabbiFromField = loan.rabbi_form_url
    && !rabbiDocs.some(d => d.file_url === loan.rabbi_form_url)
    ? loan.rabbi_form_url : null

  const rabbiForms = [
    ...(rabbiFromField ? [{ url: rabbiFromField, name: 'טופס אישור רב' }] : []),
    ...rabbiDocs.map(d => ({ url: d.file_url as string, name: d.file_name || 'טופס אישור רב' })),
  ]

  // ── "מסמכים נוספים": רשימה אחת משתי מקורות ──
  //
  // מה שצורף לבקשה (document_urls) ומה שבתיק המשפחה (otherDocs) הם אותה
  // קטגוריה מבחינת מי שקורא את התיק. `label` הוא מה שמוצג תחת התמונונת,
  // `name` הוא שם הקובץ לצורך הורדה וזיהוי סוג.
  const extraDocs: { url: string; name: string; label: string; addedInInquiry?: boolean }[] = [
    ...(Array.isArray(loan.document_urls)
      ? loan.document_urls.map((d, i) => ({
          url: d.url,
          name: d.name || `מסמך ${i + 1}`,
          label: d.name || `מסמך ${i + 1}`,
          addedInInquiry: Boolean(d.added_in_inquiry),
        }))
      : []),
    ...otherDocs.map(d => ({
      url: d.file_url as string,
      name: d.file_name ?? docTypeLabel(d.doc_type),
      label: docTypeLabel(d.doc_type),
    })),
  ]

  const docGallery = [
    ...extraDocs.map(d => ({ url: d.url, name: d.label })),
    ...rabbiForms,
    // ⚠️ בסדר המוצג (ת"ז ואז ספחים) ולא בסדר המסד: הניווט בחצים חייב
    // לעקוב אחרי מה שהעין רואה משמאל לימין.
    ...[...idPrimary, ...idAppendix].map(d => ({
      url: d.file_url as string,
      name: ID_LABELS[d.doc_type] ?? (d.file_name ?? 'מסמך'),
    })),
  ]

  // 🔴 מיקום מסמך בגלריה לפי הכתובת, לא לפי חישוב היסטים ידני. חישוב כזה
  // (אורך document_urls + rabbiForms + …) חוזר בכל כרטיס ונשבר בשקט בכל
  // פעם שמשנים את סדר הכרטיסים — קליק פותח מסמך אחר מזה שנלחץ.
  const galleryIndexOf = (url?: string | null) =>
    url ? docGallery.findIndex(g => g.url === url) : -1
  const idIndexOf = (d: { file_url: string | null }) => galleryIndexOf(d.file_url)

  const hasAnyDoc = docGallery.length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* ⚠️ מוצגת לפני כל השאר: ההחלטה על הבקשה מתקבלת במסך הזה, וההתראה
          חייבת להגיע לפניה ולא אחריה.

          🔴 רק כשהבקשה טרם הוכרעה (ממתינה או בבירור).
          ⚠️ ההתראה היא כלי החלטה: היא נועדה למנוע אישור של בקשה שנדחתה
          בעבר מסיבה שעדיין תקפה. אחרי שההחלטה כבר התקבלה אין לה תפקיד —
          היא רק חוסמת את המסך בכל כניסה לתיק מאושר, ומאמנת את המזכיר
          לסגור חלוניות בלי לקרוא אותן. */}
      {(loan.status === 'pending' || loan.status === 'inquiry') && (
        <PriorRejectionAlert loanId={loan.id} familyName={borrower ?? undefined} />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton fallback="/admin/loans" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{borrower ?? 'פרטי הלוואה'}</h1>
              <ApprovalLabelTag label={approvalLabelOf(b)} />
            </div>
            <p className="text-sm text-slate-500 ltr-num">{b?.id_number}</p>
            {/* ההסבר המלא של התווית — בכרטסת יש מקום לשורה, בשורת טבלה אין. */}
            {approvalLabelOf(b)?.notes && (
              <p className="text-xs text-slate-500 mt-0.5">{approvalLabelOf(b)?.notes}</p>
            )}
          </div>
        </div>
        {/* ⚠️ כפתורי ההכרעה הוסרו מהכותרת: ההחלטה מתקבלת אחרי קריאת החומר,
            והפאנל בתחתית הכרטסת הוא המקום היחיד לה. שני עותקים של אותה
            פעולה — אחד בראש ואחד בתחתית — הכפילו את הסיכון להכרעה בהיסח
            הדעת, ובראש הדף הם הוצגו עוד לפני שנקרא דבר. */}
        <div className="flex items-center gap-2">
          <Link href={`/admin/loans/${loan.id}/edit`}>
            <button className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors">
              <Edit size={14} /> עריכה
            </button>
          </Link>
          <DeleteLoanButton loanId={loan.id} redirect />
        </div>
      </div>

      {/* שער אישור המשפחה — אם טרם אושרה, מציג פרטים+ייחוס ומאפשר אישור ישיר; חוסם אישור בקשה לפני כן */}
      {b && <FamilyApprovalGate beneficiary={b} />}

      {/* ─────────────────────────────────────────────────────────────────
          🔴 פריסה: עמודת בירור קבועה בצד שמאל לכל גובה המסך, וכל השאר
          בטור אחד לצידה.

          ⚠️ הבירור אינו "עוד מקטע" אלא ההקשר שבו קוראים את כל השאר: מה
          נשאל, מה ענו, ומה עוד חסר. כשהוא היה מקטע בגלילה, כל בדיקה של
          פרט בבקשה הצריכה גלילה חזרה אליו.

          ⚠️ sticky ולא רק grid: הטור הימני ארוך (סיכום, פרטים, היסטוריה,
          מסמכים), ובלי ההצמדה הבירור נעלם מהמסך אחרי הגלילה הראשונה.
       ───────────────────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,420px)] items-start">

        {/* ── טור ימין: כל התוכן, בסדר העבודה ── */}
        <div className="flex flex-col gap-5 min-w-0">

          {/* 1 · סיכום המשפחה */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-violet-600">
              <Users size={16} />
              <h2 className="text-sm font-bold text-slate-700">סיכום המשפחה</h2>
            </div>
            <FamilySummary loanId={loan.id} section="family" />
          </section>

          {/* 2 · פרטי הלוואה + הערות */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-indigo-600 border-t border-slate-200 pt-5">
              <CreditCard size={16} />
              <h2 className="text-sm font-bold text-slate-700">פרטי הלוואה</h2>
            </div>

            <Card>
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-500">סכום מבוקש: </span><span className="font-bold ltr-num">{fmtCur(loan.amount)}</span></p>
                {loan.approved_amount != null && (
                  <p><span className="text-slate-500">סכום שאושר: </span><span className="font-bold text-green-700 ltr-num">{fmtCur(loan.approved_amount)}</span></p>
                )}
                <p><span className="text-slate-500">מספר תשלומים: </span>{loan.installments}</p>
                <p><span className="text-slate-500">מטרה: </span>{loan.purpose ?? '—'}</p>
                {loan.purpose_details && <p><span className="text-slate-500">פירוט מטרה: </span>{loan.purpose_details}</p>}
                {loan.declaration && <p><span className="text-slate-500">פנייה קודמת לגמ״ח: </span>{loan.declaration}</p>}
                <p><span className="text-slate-500">תאריך הגשה: </span><span className="ltr-num">{fmtDate(loan.created_at)}</span></p>
                {/* ⚠️ מקור ההגשה מוצג בכרטסת ולא רק נצבר לדוח: כשבקשה
                    נראית חריגה (טופס ממולא ביד, פרטים חסרים) השאלה
                    הראשונה היא באיזה מסלול היא הגיעה. */}
                <p><span className="text-slate-500">הוגשה דרך: </span>{loanSourceLabel(loan.submission_source)}</p>
              </div>
            </Card>

            {loan.notes && (
              <Card>
                <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">הערות</h2>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{loan.notes}</p>
              </Card>
            )}
          </section>

          {/* 3 · היסטוריית הלוואות */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-600 border-t border-slate-200 pt-5">
              <Banknote size={16} />
              <h2 className="text-sm font-bold text-slate-700">היסטוריית הלוואות</h2>
            </div>
            <FamilySummary loanId={loan.id} section="history" />
          </section>

          {/* 4 · מסמכים מצורפים */}
          {/* ⚠️ מוצג רק כשיש מסמכים: כותרת ריקה נראית כתקלה ומעלה את השאלה
              היכן הם, בעוד שבפועל פשוט לא צורפו. */}
          {hasAnyDoc && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sky-600 border-t border-slate-200 pt-5">
                <FileText size={16} />
                <h2 className="text-sm font-bold text-slate-700">מסמכים מצורפים</h2>
              </div>

              {/* 🔴 טופס אישור רב ראשון ובכרטיס משלו — הוא המסמך שההחלטה
                  נשענת עליו, ועד כה לא הוצג בכרטסת כלל. */}
              {rabbiForms.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 text-emerald-600 mb-3">
                    <FileText size={16} />
                    <span className="text-xs font-semibold text-slate-500 uppercase">טופס אישור רב</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {rabbiForms.map((d, i) => (
                      <div key={`rf-${i}`} className="flex flex-col gap-1 w-24">
                        <DocThumb href={docViewUrl(d.url)} rawUrl={d.url} name={d.name} size={96}
                          gallery={docGallery} index={galleryIndexOf(d.url)} />
                        <span className="text-[11px] text-slate-600 truncate" title={d.name}>{d.name}</span>
                        <DownloadDocButton url={d.url} docType="טופס אישור רב" person={borrower} name={d.name} variant="icon" className="self-start" />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* 🔴 כרטיס אחד לכל המסמכים הנוספים.
                  עד כה היו כאן *שני* כרטיסים נפרדים: מה שצורף לבקשה
                  (loan.document_urls) ומה שבתיק המשפחה (otherDocs). מסמך
                  שהושלם בבירור נחת בראשון ונראה מנותק מ"מסמכים נוספים"
                  שמתחתיו — אותה קטגוריה בעיני המזכיר, בשני מקומות במסך.
                  ⚠️ התווית "הושלם בתהליך הבירור" היא שמבחינה, לא הכרטיס. */}
              {extraDocs.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 text-amber-600 mb-3">
                    <FileText size={16} />
                    <span className="text-xs font-semibold text-slate-500 uppercase">מסמכים נוספים</span>
                  </div>
                  {extraDocs.length > 1 && (
                    <p className="text-[11px] text-slate-400 mb-2.5">
                      לחיצה פותחת את המסמך · מעבר בין מסמכים בחיצי המקלדת או בחצים שבצדדים
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {extraDocs.map((d, i) => (
                      <div key={`ex-${i}`} className="flex flex-col gap-1 w-24">
                        {/* ⚠️ הגלריה מועברת לכל תמונונת: המציג צריך את *כל*
                            הרשימה כדי לדעת מה הבא, ואת המיקום כדי לדעת מהיכן
                            להתחיל. */}
                        <DocThumb href={docViewUrl(d.url)} rawUrl={d.url} name={d.name} size={96}
                          gallery={docGallery} index={galleryIndexOf(d.url)} />
                        <span className="text-[11px] text-slate-600 truncate" title={d.name}>{d.label}</span>
                        {/* ⚠️ תווית למסמך שלא הגיע עם הבקשה המקורית אלא
                            הושלם בבירור — כדי שלא ייראה כאילו היה שם מלכתחילה. */}
                        {d.addedInInquiry && (
                          <span className="inline-block rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 leading-tight text-center">
                            הושלם בתהליך הבירור
                          </span>
                        )}
                        <DownloadDocButton url={d.url} docType={d.label.replace(/\.[^.\s]+$/, '')} person={borrower} name={d.name} variant="icon" className="self-start" />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {idDocs.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 text-indigo-600 mb-3">
                    <FileText size={16} />
                    <span className="text-xs font-semibold text-slate-500 uppercase">תעודות זהות</span>
                  </div>
                  {/* ⚠️ כל צילומי הת"ז, כולל הספחים וכולל קובץ שני לאותו סוג:
                      עד כה הוצגו שני כרטיסים בלבד (בעל/אישה) והשאר נשלפו
                      מהמסד רק כדי להיעלם.

                      🔴 שורה אחת בלי גלילה. עד כה grid-cols-2 נתן לספח את
                      אותו רוחב כמו לת"ז, וארבעה מסמכים ירדו לשתי שורות של
                      כרטיסים ענקיים — המזכיר גלל כדי לראות ת"ז מול ספח.
                      עכשיו הת"ז מקבלות את המקום (flex-[2]) והספחים חצי
                      ממנו (flex-[1]), הכל בשורה אחת.

                      ⚠️ `flex-wrap` עם רצפת רוחב ולא שורה נוקשה: המקרה
                      הרגיל (2 ת"ז + 2 ספחים) נכנס לשורה אחת כמבוקש, אבל
                      משפחה שהעלתה שני עמודים לכל ת"ז תקבל ירידת שורה
                      במקום ארבעה כרטיסים דחוסים עד כדי חוסר קריאות. */}
                  <div className="flex flex-wrap items-stretch gap-3">
                    {idPrimary.map((d, i) => (
                      <LoanDocCard key={`id-${i}`} label={ID_LABELS[d.doc_type] ?? d.doc_type}
                        person={borrower} url={d.file_url ?? undefined}
                        gallery={docGallery} index={idIndexOf(d)}
                        pages={pagesOfType[d.doc_type] ?? 1}
                        className="flex-[2] min-w-[180px]" imgClass="h-64" />
                    ))}
                    {idAppendix.map((d, i) => (
                      <LoanDocCard key={`ax-${i}`} label={ID_LABELS[d.doc_type] ?? d.doc_type}
                        person={borrower} url={d.file_url ?? undefined}
                        gallery={docGallery} index={idIndexOf(d)}
                        pages={pagesOfType[d.doc_type] ?? 1}
                        className="flex-[1] min-w-[110px]" imgClass="h-64" />
                    ))}
                  </div>
                </Card>
              )}
            </section>
          )}

          {/* 5 · לחצני אישור ודחייה */}
          {/* ⚠️ בתחתית ולא רק בראש: ההחלטה מתקבלת *אחרי* קריאת כל החומר,
              והמיקום כאן משקף את סדר העבודה בפועל. הכפתור בכותרת נשאר
              לגישה מהירה כשכבר יודעים מה להחליט. */}
          <section className="border-t border-slate-200 pt-5">
            <Card>
              {/* ⚠️ בקשה שכבר הוכרעה מציגה את ההחלטה, לא את כפתורי ההכרעה:
                  "אישור או דחייה — סיבת הדחייה תישמר" מנוסח כהוראה לפעולה
                  שכבר בוצעה, והמזכיר לא ידע מהסתכלות אם הבקשה טופלה. */}
              <LoanDecisionPanel loan={loan} familyApproved={familyApproved} />
            </Card>
          </section>

          {/* 6 · ביצוע ההלוואה */}
          {/* ⚠️ הועבר לכאן מכרטיסי הפרטים למעלה: הביצוע הוא השלב שאחרי
              ההכרעה, ומיקומו מעל לחצני האישור/דחייה הציג "טרם בוצע"
              לפני שבכלל הוחלט אם לאשר — כלומר סטטוס של שלב שטרם הגיע. */}
          <section className="border-t border-slate-200 pt-5">
            <Card>
            <div className="flex items-center gap-2 mb-3">
            {loan.disbursed_at
            ? <CheckCircle2 size={16} className="text-emerald-500" />
            : <Clock size={16} className="text-amber-500" />}
            <span className="text-xs font-semibold text-slate-500 uppercase">ביצוע הלוואה</span>
            </div>
            {loan.disbursed_at ? (
            <div className="space-y-1.5 text-sm">
            <p><span className="text-slate-500">סטטוס: </span><span className="font-semibold text-emerald-700">בוצע ✓</span></p>
            <p><span className="text-slate-500">תאריך ביצוע: </span><span className="ltr-num">{fmtDate(loan.disbursed_at)}</span></p>
            {loan.disbursed_by && <p><span className="text-slate-500">בוצע על ידי: </span>{loan.disbursed_by}</p>}
            </div>
            ) : (
            <p className="text-sm text-slate-400">טרם בוצע — יסומן דרך פורטל הביצוע</p>
            )}
            </Card>
          </section>
        </div>

        {/* ── טור שמאל: הבירור, צמוד לכל הגובה ── */}
        <aside className="flex flex-col gap-2 lg:sticky lg:top-4">
          <div className="flex items-center gap-2 text-sky-600">
            <MessageSquare size={16} />
            <h2 className="text-sm font-bold text-slate-700">בירור מול המבקש</h2>
          </div>
          <LoanInquiryPanel loanId={loan.id} hasEmail={Boolean(b?.email)} applicantName={borrower} />
        </aside>
      </div>
    </div>
  )
}

// כרטיס מסמך זהות. `className` קובע את הרוחב היחסי בשורה (ת"ז מול ספח),
// `imgClass` את הגובה — כדי שכל הכרטיסים יתיישרו לאותו קו בסיס.
function LoanDocCard({ label, url, person, gallery, index, pages = 1, className = '', imgClass = 'h-72' }: {
  /** מספר הקבצים באותו סוג — ת"ז דו-צדדית = 2. */
  pages?: number
  label: string; url?: string; person?: string
  gallery?: { url: string; name?: string | null }[]
  index?: number
  className?: string
  imgClass?: string
}) {
  if (!url) return null
  const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url)
  const isPdf = /\.pdf(\?|$)/i.test(url)
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
    {/* ⚠️ הגלריה מועברת גם מכאן: בלעדיה הת"ז נפתחת כמסמך בודד והחצים
        נעלמים — המזכיר נאלץ לסגור ולפתוח כל מסמך בנפרד. */}
    <ViewDocButton url={url} name={label} gallery={gallery} index={index}
       className="flex flex-col gap-2 p-2 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-sm transition-all group">
      {isImage ? (
        <SafeDocImage path={url} name={label} alt={label} className={`w-full ${imgClass} object-contain rounded-lg bg-slate-50`} />
      ) : isPdf ? (
        // תצוגה מקדימה אמיתית — העמוד הראשון מצויר על canvas
        <PdfCanvasView url={url} name={label} maxPages={1} cover className={`w-full ${imgClass} rounded-lg overflow-hidden bg-white`} />
      ) : (
        <div className={`w-full ${imgClass} bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center`}>
          <FileText size={28} className="text-slate-400" />
        </div>
      )}
      <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-600 flex items-center justify-center gap-1 text-center">
        <span className="truncate" title={label}>{label}</span>
        {/* ⚠️ "2 עמודים" — הכרטיס מייצג את המסמך כולו. */}
        {pages > 1 && <span className="flex-shrink-0 text-indigo-500">· {pages} עמודים</span>}
        <ExternalLink size={11} className="flex-shrink-0" />
      </span>
    </ViewDocButton>
      <DownloadDocButton url={url} docType={label} person={person} variant="button" className="justify-center" />
    </div>
  )
}
