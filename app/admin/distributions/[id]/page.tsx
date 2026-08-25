import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowRight, Gift, CalendarDays, Pencil } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { approvalLabelOf } from '@/lib/approvalLabel'
import type { Distribution } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import NoPermission from '@/components/ui/NoPermission'
import { format, differenceInYears } from 'date-fns'
import { he } from 'date-fns/locale'
import HolidayRegistrations, { type RegistrationRow } from './HolidayRegistrations'
import InviteLinkPanel from './InviteLinkPanel'
import { toRegistrationRow } from '@/lib/distributionRow'
import type { RegisterSource } from '@/lib/distributionSources'
import type { ApprovalStatus } from '@/lib/holidayCards'

// ─────────────────────────────────────────────────────────────────────────────
// מסך חלוקת חגים — שלב הרישום.
//
// ⚠️ כל המספרים נגזרים מהשורות עצמן בכל טעינה ואינם נשמרים בשום מקום: הצפי
// התקציבי משתנה בכל רישום חדש, וסיכום שמור היה מציג למנהל נתון מיושן בדיוק
// ברגע שבו הוא בונה עליו תקציב.
// ─────────────────────────────────────────────────────────────────────────────

interface BenRow {
  id: string
  full_name?: string | null
  family_name?: string | null
  spouse_name?: string | null
  id_number?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  community_affiliation?: string | null
  children_count?: number | null
  birth_date?: string | null
  spouse_birth_date?: string | null
}

// 🔴 שאילתה קלה שרצה מיד — כותרת החלוקה בלבד.
// ⚠️ נפרדת מ-getData במכוון: קודם הדף חיכה לשתיהן יחד, והמסך נשאר ריק
// שניות ארוכות למרות שהכותרת הייתה מוכנה כמעט מיד.
async function getDistribution(id: string) {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from('distributions').select('*').eq('id', id).single()
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  return (data as Distribution | null) ?? null
}

async function getData(id: string) {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  // ⚠️ הנרשמים נשלפים בדפים: תקרת השורות של PostgREST נאכפת בצד השרת ואינה
  // ניתנת לעקיפה ב-limit, ולכן הרשימה נחתכה ב-1,000 בלי שגיאה ובלי סימן.
  // ראו lib/fetchAllRows.
  // ⚠️ שתי מחרוזות select מפורשות ולא תבנית עם משתנה: הטיפוסים של
  // supabase-js נגזרים מהמחרוזת *הליטרלית*, ואינטרפולציה מבטלת את ההסקה.
  // 🔴 רק הדף הראשון בטעינת המסך — השאר נטען ברקע.
  //
  // ⚠️ המסך המתין ל-4.8MB (6,047 נרשמים × כל פרטי המשפחה) לפני שהציג
  // שורה אחת, כדי להראות 50. המסד לוקח 25ms; הזמן כולו הוא המטען.
  // עכשיו 250 שורות מגיעות מיד, והרשימה המלאה משלימה את עצמה מאחור
  // דרך /api/admin/distributions/[id]/rows.
  //
  // ⚠️ 250 ולא 50: הדפדוף מציג 50, אבל בורר העמודים מאפשר עד 200 —
  // ו-250 מכסה גם מעבר לעמוד הבא לפני שהרקע הספיק.
  const FIRST_PAGE = 250

  const fetchWithLabel = () => fetchAllRows<Record<string, unknown>>((from, to) => supabase
      .from('distribution_recipients')
      .select('id, source, registered_at, phone, notified_at, amount, beneficiary_id, approval_status, approved_at, card_number, card_linked_at, card_link_error, notify_error, center_id, center_source, load_status, center:holiday_centers(id, city, name), beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date, approval_label:approval_labels(id, name, color, notes))')
      .eq('distribution_id', id)
      .order('registered_at', { ascending: false })
      .range(from, Math.min(to, FIRST_PAGE - 1)))
  const fetchPlain = () => fetchAllRows<Record<string, unknown>>((from, to) => supabase
      .from('distribution_recipients')
      .select('id, source, registered_at, phone, notified_at, amount, beneficiary_id, approval_status, approved_at, card_number, card_linked_at, card_link_error, notify_error, center_id, center_source, load_status, center:holiday_centers(id, city, name), beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date)')
      .eq('distribution_id', id)
      .order('registered_at', { ascending: false })
      .range(from, Math.min(to, FIRST_PAGE - 1)))

  // ⚠️ תווית סיבת האישור בנפילה-לאחור: ה-join אינו קיים עד שהמיגרציה של
  // approval_labels רצה, ובלעדיה כל מסך החלוקה היה זורק.
  let recRes = await fetchWithLabel()
  if (recRes.error) {
    console.error(`[admin/distributions/${id}] approval label join failed, retrying without it:`, recRes.error)
    recRes = await fetchPlain()
  }
  if (recRes.error) {
    console.error(`[admin/distributions/${id}] recipients query failed:`, recRes.error)
    throw new Error(recRes.error)
  }

  // ⚠️ ההמרה ב-lib/distributionRow: אותה פונקציה משמשת את הרשימה
  // שנטענת ברקע, ושני מימושים היו יוצרים שורות שונות.
  const rows: RegistrationRow[] = recRes.rows.map(toRegistrationRow)

  // 🔴 מספר הנרשמים האמיתי, ולא rows.length.
  //
  // ⚠️ הטעינה הראשונה מביאה 250 שורות בלבד. בלי count נפרד המונה
  // "נרשמו" היה מציג 250 מתוך 6,047 — מספר שגוי שהמנהל מסתמך עליו
  // לתקציב, ושהיה מתקן את עצמו בשקט שנייה אחר כך.
  const { count } = await supabase
    .from('distribution_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('distribution_id', id)

  return { rows, total: count ?? rows.length }
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'

export default async function DistributionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // 🔴 האכיפה חייבת להיות כאן, *לפני* getData.
  //
  // זה המסך שנושא את ה-PII המלא: שם, ת"ז, טלפון, כתובת ומספר ילדים של כל
  // נרשם — וגם הייצוא לאקסל, שנבנה בדפדפן מאותן שורות בדיוק. שליפה ואז
  // אי-הצגה אינה הגנה: הנתונים כבר הועברו לרינדור, והייצוא היה ממשיך לעבוד.
  // ההרשאה נבדקת כאן ולא ב-HolidayRegistrations, כי useCan הוא שכבת ממשק
  // בלבד — הוא מסתיר כפתורים, הוא אינו מונע נתונים.
  if (!(await requirePermission('distributions', 'view'))) {
    return <NoPermission detail="נדרשת הרשאת צפייה בחלוקות חגים כדי לראות את רשימת הנרשמים." />
  }

  // ⚠️ הרשאת העריכה נבדקת בשרת ומועברת כדגל: היא שולטת על יצירת קישורי
  // רישום וביטולם — פעולות שפותחות רישום סגור, ולכן אינן נגזרות מהרשאת הצפייה.
  const canEditDistribution = !!(await requirePermission('distributions', 'edit'))

  // ⚡ רק כותרת החלוקה נטענת כאן — שאילתה אחת קלה. רשימת הנרשמים
  // זורמת בנפרד ב-Suspense, ולכן המסך מופיע מיד.
  const d = await getDistribution(id)
  if (!d && isSupabaseConfigured()) notFound()
  if (!d) return <div className="p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>
  const amount = Number(d.amount_per_family ?? 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/admin/distributions" className="text-slate-400 hover:text-slate-600 mt-1"><ArrowRight size={20} /></Link>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Gift size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
              {d.name}
              {d.year && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{d.year}</span>}
              <StatusBadge status={d.status} />
            </h1>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
              {amount > 0 && <span className="font-bold text-emerald-700 ltr-num">{amount.toLocaleString('he-IL')} ₪ למשפחה</span>}
              {d.distribution_date && <span className="flex items-center gap-1"><CalendarDays size={12} />{fmtDate(d.distribution_date)}</span>}
              {d.description && <span>{d.description}</span>}
            </p>
          </div>
        </div>
        <Link href={`/admin/distributions/${d.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
          <Pencil size={14} /> עריכת החלוקה
        </Link>
      </div>

      {amount <= 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900">
          לא הוגדר סכום למשפחה — הצפי התקציבי יוצג כאפס. יש להזין את הסכום בעריכת החלוקה.
        </div>
      )}

      <InviteLinkPanel distributionId={d.id} canEdit={canEditDistribution} />

      {/* ⚡ הרשימה זורמת: הכותרת והקישורים כבר על המסך, והשלד הזה
          מתחלף בנתונים כשהם מגיעים — במקום דף ריק לכל משך השליפה. */}
      <Suspense fallback={<RegistrationsSkeleton />}>
        <RegistrationsLoader
          id={d.id}
          amount={amount}
          registrationOpen={d.registration_open === true}
          // ⚠️ 'cancelled' = כיבוי מוחלט: המשפחה רואה "אין חלוקה" בכל הערוצים.
          distributionActive={d.status !== 'cancelled'}
          distributionName={`${d.name}${d.year ? ` ${d.year}` : ''}`}
        />
      </Suspense>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// טוען את רשימת הנרשמים — רץ בתוך Suspense, ולכן אינו חוסם את הכותרת.
//
// ⚠️ רכיב נפרד ולא await בגוף הדף: Suspense עוצר רק על גבול רכיב. await
// ישיר בדף היה משהה את *כל* הדף בדיוק כמו קודם.
// ─────────────────────────────────────────────────────────────────────────────
async function RegistrationsLoader({ id, amount, registrationOpen, distributionActive, distributionName }: {
  id: string; amount: number; registrationOpen: boolean
  distributionActive?: boolean; distributionName: string
}) {
  const data = await getData(id)
  if (!data) return null
  return (
    <HolidayRegistrations
      distributionId={id}
      rows={data.rows}
      totalCount={data.total}
      amountPerFamily={amount}
      registrationOpen={registrationOpen}
      distributionActive={distributionActive}
      distributionName={distributionName}
    />
  )
}

/** שלד הרשימה — צורת המסך האמיתית, כדי שהמעבר לא יקפיץ את הפריסה. */
function RegistrationsSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-32 rounded-2xl border border-slate-200 bg-white" />
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="h-11 bg-slate-50 border-b border-slate-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-slate-100 last:border-0" />
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">טוען את רשימת הנרשמים…</p>
    </div>
  )
}
