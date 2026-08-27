import {
  Users, Landmark, Baby, UtensilsCrossed, Gift,
  HandCoins, Mail, TrendingUp, Clock, AlertCircle, CheckCircle2,
  ArrowLeft, ArrowUpRight, Download,
} from 'lucide-react'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServiceClient, requireStaff } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import type { SectionKey } from '@/types'
import { getPendingTasks } from '@/lib/pendingTasks'
import { visibleTasks } from '@/lib/pendingTasksScope'
import { getPurchases } from '@/lib/cardPurchases'
import { cardsDelivered } from '@/lib/cardsDelivered'
import { isSupabaseConfigured } from '@/lib/supabase/server'
import { isAwaitingCard, holdsCard, AWAITING_SELECT, type AwaitingAid } from '@/lib/awaitingFilter'
import { maternityCounts } from '@/lib/maternityCounts'
import LiveRefresh from '@/components/LiveRefresh'
import PendingTasksPanel from './PendingTasksPanel'

interface DashData {
  totalBeneficiaries: number
  newBeneficiariesWeek: number
  approved: number
  pending: number
  activeLoans: number
  pendingLoans: number
  loansApprovedTotal: number
  loansDisbursed: number
  disbursedAmount: number
  legacyCount: number
  legacyTakenCount: number
  loansApprovedWeek: number
  totalLoanAmount: number
  maternityActive: number
  maternityPending: number
  maternityDeepReview: number
  cardsLoaded: number
  cardsPending: number
  cardsRemaining: number
  widowPending: number
  widowInProgress: number
  distributionsPlanned: number
  // חלוקות חגים — החלוקה שהרישום אליה פתוח כרגע
  holidayName: string | null
  holidayRegistered: number
  holidayExpected: number
  holidayOpen: boolean
  aidPending: number
  aidAwaiting: number
  aidApproved: number
  dismissedByType: Record<string, number>
  deepReview: number
}

const EMPTY: DashData = {
  totalBeneficiaries: 0, newBeneficiariesWeek: 0, approved: 0, pending: 0,
  activeLoans: 0, pendingLoans: 0, loansApprovedWeek: 0, totalLoanAmount: 0,
  loansApprovedTotal: 0, loansDisbursed: 0, disbursedAmount: 0, legacyCount: 0, legacyTakenCount: 0,
  maternityActive: 0, maternityPending: 0, maternityDeepReview: 0, cardsLoaded: 0, cardsPending: 0, cardsRemaining: 0,
  widowPending: 0, widowInProgress: 0, distributionsPlanned: 0,
  holidayName: null, holidayRegistered: 0, holidayExpected: 0, holidayOpen: false,
  aidPending: 0, aidAwaiting: 0, aidApproved: 0, dismissedByType: {}, deepReview: 0,
}

// ספירות הדשבורד ארגון-רחבות (count/head — ללא העברת שורות) ואינן דורשות דיוק של שנייה.
// ממטמנים ל-60ש' עם service client כדי לא להריץ 20 שאילתות בכל טעינת/רענון של הדשבורד.
const getStats = unstable_cache(
  async (): Promise<DashData> => {
    const supabase = getServiceClient()
    if (!supabase) return EMPTY
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const headCount = { count: 'exact' as const, head: true }
    const [
      totalBeneficiaries, newBeneficiariesWeek, approved, pending,
      activeLoans, pendingLoans, loansApprovedWeek,
      loansApprovedTotal, disbursedRows, legacyRows,
      matCounts, activeAidRows,
      widowPending, widowInProgress, distributionsPlanned,
      aidPending, aidAwaiting, aidApproved,
      activeLoanAmounts, cardStockBalance, dismissedTasks, deepReview,
    ] = await Promise.all([
      supabase.from('beneficiaries').select('id', headCount),
      supabase.from('beneficiaries').select('id', headCount).gte('created_at', weekAgo),
      supabase.from('beneficiaries').select('id', headCount).eq('eligibility_status', 'approved'),
      supabase.from('beneficiaries').select('id', headCount).eq('eligibility_status', 'pending'),
      supabase.from('loans').select('id', headCount).eq('status', 'active'),
      supabase.from('loans').select('id', headCount).in('status', ['pending', 'inquiry']),
      supabase.from('loans').select('id', headCount).in('status', ['active', 'approved', 'completed']).gte('created_at', weekAgo),
      // סך ההלוואות שאושרו אי-פעם (לא רק השבוע)
      supabase.from('loans').select('id', headCount).in('status', ['active', 'approved', 'completed']),
      // 🔴 "בוצעו" = disbursed_at, שנקבע בפורטל הביצוע — ולא סטטוס הבקשה.
      // אישור ההלוואה וביצוע התשלום הם שני אירועים נפרדים, ובדיוק הפער
      // ביניהם הוא מה שהמנהל צריך לראות.
      supabase.from('loans').select('approved_amount, amount').not('disbursed_at', 'is', null),
      // ארכיון ההלוואות מהמערכת הקודמת
      supabase.from('legacy_loans').select('taken_amount'),
      // 🔴 מוני היולדות — דרך מקור האמת (lib/maternityCounts), לא בשאילתה
      // גולמית. הדשבורד הציג "2 ממתינות לאישור מנהל" בעוד המסך הציג 0:
      // הרשימה מורידה תיק שנשלח אליו בירור והיולדת טרם ענתה, והספירה
      // הגולמית לא ידעה על הכלל. אותה תקלה כבר תוקנה כאן בכרטיסים ובמלאי.
      // ⚠️ הצרה מכוונת: הטיפוסים המחוללים של PostgREST עמוקים מדי ומפילים
      // את tsc ב-"excessively deep" כשהלקוח נכנס כמות שהוא.
      maternityCounts(supabase as unknown as Parameters<typeof maternityCounts>[0]),
      // ⚠️ מקור אמת יחיד עם מסך הכרטיסים, ולא ספירה עצמאית: העמודה הישנה
      // card_status כמעט אינה נכתבת עוד (card_load_status היא החיה), ולכן
      // "כרטיסים טעונים" בדשבורד הראה 52 בזמן שמסך הכרטיסים הראה 49. שני
      // מספרים לאותו דבר = המנהל מפסיק להאמין לשניהם.
      supabase.from('maternity_aids').select(`id, status, ${AWAITING_SELECT}`).eq('status', 'active'),
      supabase.from('widow_requests').select('id', headCount).eq('status', 'pending'),
      supabase.from('widow_requests').select('id', headCount).eq('status', 'in_progress'),
      supabase.from('distributions').select('id', headCount).in('status', ['planning', 'active']),
      supabase.from('financial_aid_requests').select('id', headCount).eq('status', 'pending'),
      supabase.from('financial_aid_requests').select('id', headCount).eq('status', 'awaiting_decision'),
      supabase.from('financial_aid_requests').select('id', headCount).eq('status', 'approved'),
      supabase.from('loans').select('amount').eq('status', 'active'),
      // ⚠️ מלאי הכרטיסים = המלאי הגלובלי מ-card_stock_balance (מקור האמת היחיד,
      // אותו שמסך הכרטיסים מציג). קודם הדשבורד חישב סכום card_centers.stock ישן
      // פחות כרטיסים שנטענו — שיטה שפרשה מהמודל הגלובלי והראתה מספר שגוי (23
      // במקום 299). המלאי כבר לא יושב במוקדים אלא במאזן גלובלי אחד.
      supabase.from('card_stock_balance').select('balance').maybeSingle(),
      // בקשות שהוסתרו מלוח "ממתינים לטיפול" — מנוכות מהמונה כדי שיתאים לרשימה בפאנל.
      // ⚠️ חייבים את entity_type כדי לנכות *פר-סוג*: הסתרת משימת הלוואה לא יכולה
      // לנכות ממונה היולדות. ניכוי גלובלי גרם ל"ממתינים=0" בעוד היולדות עדיין 2.
      supabase.from('dismissed_pending_tasks').select('entity_type'),
      // משפחות בבדיקת יחוס מעמיקה — דורשות תשומת לב של המנהל
      supabase.from('beneficiaries').select('id', headCount).eq('eligibility_status', 'deep_review'),
    ])

    // ⚠️ holdsCard הוא מקור האמת היחיד ל"נמסרו" — משותף עם מסך הכרטיסים. קודם
    // היה כאן תנאי מקומי שלא בדק wants_food_card, ולכן הדשבורד הציג 54 בעוד
    // מסך הכרטיסים הציג 49.
    const aidRows = (activeAidRows.data ?? []) as AwaitingAid[]
    const loadedCount = aidRows.filter(holdsCard).length
    const awaitingCount = aidRows.filter(isAwaitingCard).length

    // ── חלוקת החגים הפתוחה ──
    // ⚠️ שאילתה תלויה (קודם החלוקה, אחר כך הנרשמים אליה) ולכן אינה ב-Promise.all.
    const { data: openDist } = await supabase
      .from('distributions')
      .select('id, name, year, amount_per_family')
      .eq('registration_open', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const holidayRegistered = openDist
      ? (await supabase.from('distribution_recipients').select('id', headCount).eq('distribution_id', openDist.id)).count ?? 0
      : 0
    return {
      totalBeneficiaries: totalBeneficiaries.count ?? 0,
      newBeneficiariesWeek: newBeneficiariesWeek.count ?? 0,
      approved: approved.count ?? 0,
      pending: pending.count ?? 0,
      activeLoans: activeLoans.count ?? 0,
      pendingLoans: pendingLoans.count ?? 0,
      loansApprovedWeek: loansApprovedWeek.count ?? 0,
      loansApprovedTotal: loansApprovedTotal.count ?? 0,
      loansDisbursed: (disbursedRows.data ?? []).length,
      // ⚠️ approved_amount ולא amount: המבוקש והמאושר נבדלים, ומה שבוצע
      // בפועל הוא הסכום שאושר. נפילה-לאחור ל-amount לרשומות ישנות.
      disbursedAmount: (disbursedRows.data ?? []).reduce((sum, x) => sum + (Number((x as { approved_amount?: number | null }).approved_amount ?? (x as { amount?: number | null }).amount) || 0), 0),
      legacyCount: (legacyRows.data ?? []).length,
      legacyTakenCount: (legacyRows.data ?? []).filter(x => (x as { taken_amount?: number | null }).taken_amount != null).length,
      totalLoanAmount: (activeLoanAmounts.data ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0),
      maternityActive: matCounts.active,
      maternityPending: matCounts.pending,
      maternityDeepReview: matCounts.deepReview,
      cardsLoaded: loadedCount,
      cardsPending: awaitingCount,
      cardsRemaining: Number(cardStockBalance.data?.balance ?? 0),
      widowPending: widowPending.count ?? 0,
      widowInProgress: widowInProgress.count ?? 0,
      distributionsPlanned: distributionsPlanned.count ?? 0,
      holidayName: openDist ? [openDist.name, openDist.year].filter(Boolean).join(' ') : null,
      holidayRegistered: holidayRegistered,
      // ⚠️ הצפי מחושב מהנרשמים × הסכום למשפחה ואינו נשמר: סכום שנשמר מתיישן
      // ברישום הבא, והמנהל מתכנן תקציב לפי נתון שאינו נכון.
      holidayExpected: holidayRegistered * Number(openDist?.amount_per_family ?? 0),
      holidayOpen: !!openDist,
      aidPending: aidPending.count ?? 0,
      aidAwaiting: aidAwaiting.count ?? 0,
      aidApproved: aidApproved.count ?? 0,
      // ניכוי מפולח לפי סוג — כדי שכל מונה ינכה רק את מה שהוסתר *ממנו*
      dismissedByType: (() => {
        const rows = (dismissedTasks.data ?? []) as { entity_type?: string }[]
        const c: Record<string, number> = {}
        for (const r of rows) { const t = String(r.entity_type ?? ''); if (t) c[t] = (c[t] ?? 0) + 1 }
        return c
      })(),
      deepReview: deepReview.count ?? 0,
    }
    } catch {
      return EMPTY
    }
  },
  ['dashboard-stats'],
  { revalidate: 5 },
)

// "20,000 ₪" — סימן המטבע אחרי המספר. Intl עם style:'currency' שם אותו לפני
// ("₪20,000"), וזה נקרא הפוך בעברית.
const fmtCur = (n: number) =>
  `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`

// 🔴 ההלוואות מתנהלות בדולרים, לא בשקלים — התקרה היא 10,000$ וכל מסכי
// הגמ"ח (הרשימה, הכרטסת, פורטל הביצוע) מציגים "$" לפני המספר. הדשבורד
// היה המקום היחיד שהציג את אותו סכום בדיוק כ-"₪", כלומר אותו נתון בשתי
// מטבעות בשני מסכים — ומספר תקציבי שנקרא במטבע הלא נכון הוא טעות של
// פי 3.5 בהערכת החשיפה.
//
// ⚠️ פונקציה נפרדת ולא שינוי של fmtCur: הקורא השני שלה הוא הצפי התקציבי
// של חלוקות החגים, שבאמת מתנהל בשקלים. החלפה במקום הייתה מתקנת מספר אחד
// ושוברת אחר.
//
// ⚠️ הסימן לפני המספר, בשונה מהשקל: כך זה נכתב בכל שאר מסכי ההלוואות,
// ואחידות חשובה כאן יותר מהעדפת הכיווניות בעברית.
const fmtUsd = (n: number) =>
  `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)}`
const fmt = (n: number) => n.toLocaleString('he-IL')

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  return 'ערב טוב'
}


export default async function DashboardPage() {
  // ── מי רואה מה ──────────────────────────────────────────────────────────
  // ⚠️ לוח הבקרה אינו "מחלקה" ולכן אין לו guardPage — אבל כל קובייה שלו
  // חושפת נתוני מחלקה (סכומי הלוואות, מספרי לידות, תקציב חלוקות). בלי
  // הסינון הזה משתמש שהורשה למחלקה אחת קרא את המספרים של כל השאר.
  //
  // ⚠️ הסינון בשרת ולא ב-CSS: קובייה מוסתרת ב-hidden עדיין מגיעה ל-HTML
  // ונקראת ב-view-source. כאן היא פשוט אינה מרונדרת.
  const staff = await requireStaff()
  if (!staff) redirect('/login')
  const can = (section: SectionKey) =>
    staff.role === 'admin' || roleAllows(staff.role, staff.permissions, section, 'view')

  const DEPT_SECTIONS: SectionKey[] = [
    'beneficiaries', 'loans', 'maternity', 'maternity_cards', 'distributions', 'financial_aid',
  ]
  const anyDept = DEPT_SECTIONS.some(can)

  const cached = await getStats()
  // ⚠️ מלאי הכרטיסים נקרא *מחוץ* למטמון, בכל טעינה. הספירות הכבדות יכולות
  // להיות בנות חמש שניות, אבל המלאי לא: כשהדשבורד הציג 251 ומסך הכרטיסים 250,
  // המנהל אינו חושב "מטמון" אלא "אחד מהמספרים שקרי" — ומפסיק להאמין לשניהם.
  // שאילתה אחת על view מסוכם, זולה דיה לכל טעינה.
  //
  // ⚠️ הרכישות נקראות כאן יחד עם המלאי, ומאותה סיבה: "נמסרו" נגזר משניהם
  // (ראה lib/cardsDelivered), וקריאת אחד מהם ממטמון בזמן שהשני חי הייתה
  // מציגה משוואה שאינה נסגרת — בדיוק התסמין שהתלוננו עליו.
  const live = await (async () => {
    const db = getServiceClient()
    if (!db) return { stock: null as number | null, purchased: 0 }
    const [stockRes, purchasesRes] = await Promise.all([
      db.from('card_stock_balance').select('balance').maybeSingle(),
      getPurchases(db),
    ])
    return {
      stock: stockRes.data ? Number(stockRes.data.balance ?? 0) : null,
      purchased: purchasesRes.totalPurchased,
    }
  })()
  const s = live.stock == null ? cached : { ...cached, cardsRemaining: live.stock }

  // "נמסרו" = נקנו − במלאי, ולא ספירת לידות פעילות. הספירה לפי status
  // השמיטה לידות שהושלמו — הכרטיס שלהן יצא ואינו חוזר — והלוח הציג 146
  // בעוד שהמשוואה מחייבת 152.
  const delivered = cardsDelivered(live.purchased, s.cardsRemaining)
  // "ממתינים לטיפול" — נספר מאותו מקור אמת שהפאנל משתמש בו (getPendingTasks),
  // כדי שהכרטיס והרשימה יראו *בדיוק* אותו מספר. הניכוי-ספירה הקודם נתן פער
  // (כרטיס 1, רשימה 4) כשהיו שורות dismissed יתומות שכבר לא ממתינות.
  // ⚠️ מסונן לפי הרשאות: הפאנל מאחד חמש מחלקות (ובהן אלמנות), והספירה
  // חייבת לשקף את מה שהמשתמש באמת יראה — אחרת הכרטיס מציג 12 והרשימה 3.
  const svc = getServiceClient()
  const pendingTotal = svc
    ? visibleTasks(await getPendingTasks(svc), staff.role, staff.permissions, staff.role === 'admin').length
    : 0

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* 🔴 הדשבורד הוא Server Component ולכן היה קפוא עד ריענון ידני.
          מרענן כל 30 שניות, ומיד בחזרה ללשונית. עוצר כשהיא מוסתרת. */}
      <LiveRefresh seconds={30} />

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{getGreeting()}</h1>
          <p className="text-slate-500 mt-1 text-sm">ברוך הבא ללוח הבקרה של היכל החתם סופר</p>
        </div>
        {/* ⚠️ נבדק כמו כל שאר הלוח: הכפתור הוביל למסך הדוחות גם למי שאין
            לו הרשאת דוחות, והמסך עצמו חסם — כלומר הבטחה שנשברת בלחיצה. */}
        {can('reports') && (
        <Link href="/admin/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-white text-sm
                     bg-gradient-to-b from-indigo-500 to-indigo-600 ring-1 ring-inset ring-white/15
                     shadow-[0_1px_2px_rgba(15,23,42,0.18),0_8px_18px_-6px_rgba(79,70,229,0.55)]
                     transition-all duration-150 hover:from-indigo-500 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
          <Download size={15} />
          הורדת דוחות
        </Link>
        )}
      </div>

      {!isSupabaseConfigured() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span><strong>מצב פיתוח:</strong> Supabase לא מוגדר — מוצגים נתוני אפס.</span>
        </div>
      )}

      {/* ── KPI Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {can('beneficiaries') && (
          <KpiCard
            label="משפחות רשומות"
            value={fmt(s.totalBeneficiaries)}
            sub={`${fmt(s.newBeneficiariesWeek)} נרשמו השבוע`}
            subPositive
            icon={<Users size={18} />}
            color="indigo"
            href="/admin/beneficiaries"
          />
        )}
        {can('loans') && (
          <KpiCard
            // 🔴 סכום שנמסר בפועל (disbursed_at) ולא סכום התיקים הפעילים:
            // "כמה כסף באמת יצא" הוא המספר שמחפשים, וסכום הפעילים החמיץ את
            // מה שאושר, נמסר והושלם.
            label="סכום ההלוואות בפועל"
            value={fmtUsd(s.disbursedAmount)}
            sub={`${fmt(s.loansDisbursed)} קיבלו שטר · ${fmt(s.activeLoans)} פעילות`}
            icon={<Landmark size={18} />}
            color="blue"
            href="/admin/loans"
          />
        )}
        <PendingTasksPanel count={pendingTotal} />
        {/* "מייל בלבד" רואה את הקובייה מתוקף ההגדרה, כמו בסרגל */}
        {(can('mail') || staff.mailOnly) && (
          <KpiCard
            label="תיבת המייל"
            value="מייל"
            sub="דואר נכנס ויוצא"
            icon={<Mail size={18} />}
            color="violet"
            href="/admin/mail"
          />
        )}
      </div>

      {/* ⚠️ משתמש בלי אף הרשאת מחלקה קיבל עמוד ריק שנראה כתקלה במערכת.
          הודעה מפורשת עדיפה — היא אומרת לו למי לפנות במקום להשאיר אותו
          מול מסך לבן. */}
      {!anyDept && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0 text-slate-400" />
          <span>לא הוגדרו לך מחלקות להצגה בלוח הבקרה. לפתיחת גישה — פנה למנהל המערכת.</span>
        </div>
      )}

      {/* ── Departments ──────────────────────────────────────────── */}
      {anyDept && (
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-4">אגפי העמותה</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

          {can('beneficiaries') && (
          <DeptCard
            title="איגוד הצאצאים"
            icon={<Users size={20} />}
            href="/admin/beneficiaries"
            accent="#6366f1"
            rows={[
              { label: 'רשומות מאושרות', value: fmt(s.approved), tone: 'success' },
              { label: 'ממתינות לאישור', value: fmt(s.pending), tone: s.pending > 0 ? 'warning' : 'neutral' },
              { label: 'בבדיקה מעמיקה', value: fmt(s.deepReview), tone: s.deepReview > 0 ? 'danger' : 'neutral' },
              { label: 'נרשמו השבוע', value: fmt(s.newBeneficiariesWeek), tone: 'info' },
            ]}
          />
          )}

          {can('loans') && (
          <DeptCard
            title="גמ״ח — הלוואות"
            icon={<Landmark size={20} />}
            href="/admin/loans"
            accent="#3b82f6"
            rows={[
              { label: 'בקשות לאישור', value: fmt(s.pendingLoans), tone: s.pendingLoans > 0 ? 'warning' : 'neutral' },
              // ⚠️ "בפיגור" הוסר — לא רלוונטי לגמ"ח הזה (החלטת המשתמש).
              { label: 'אושרו', value: fmt(s.loansApprovedTotal), tone: 'success' },
              // 🔴 "קיבלו שטר" = disbursed_at מפורטל הביצוע, ולא סטטוס הבקשה.
              // אישור ומסירת השטר הם שני אירועים נפרדים, והפער ביניהם הוא
              // מה שצריך להיראות.
              { label: 'קיבלו שטר', value: fmt(s.loansDisbursed), tone: 'info' },
              { label: 'סכום ההלוואות בפועל', value: fmtUsd(s.disbursedAmount), tone: 'info' },
              { label: 'הלוואות פעילות', value: fmt(s.activeLoans), tone: 'neutral' },
              // ארכיון: כמה נלקחו בפועל מתוך סך ההלוואות ההיסטוריות.
              { label: 'ארכיון (מערכת קודמת)', value: `${fmt(s.legacyTakenCount)} / ${fmt(s.legacyCount)}`, tone: 'neutral' },
            ]}
          />
          )}

          {can('maternity') && (
          <DeptCard
            title="עזר יולדות"
            icon={<Baby size={20} />}
            href="/admin/maternity"
            accent="#ec4899"
            rows={[
              { label: 'בקשות לאישור', value: fmt(s.maternityPending), tone: s.maternityPending > 0 ? 'warning' : 'neutral' },
              { label: 'בבדיקה מעמיקה', value: fmt(s.maternityDeepReview), tone: s.maternityDeepReview > 0 ? 'danger' : 'neutral' },
              { label: 'תיקים פעילים', value: fmt(s.maternityActive), tone: 'success' },
            ]}
          />
          )}

          {can('maternity_cards') && (
          <DeptCard
            title="כרטיסי מזון יולדות"
            icon={<UtensilsCrossed size={20} />}
            href="/admin/maternity/cards"
            accent="#10b981"
            /* ⚠️ שלוש השורות מרכיבות משוואה שהמנהל יכול לסגור בעצמו:
               נקנו − נמסרו = מלאי. קודם הוצג "נמסרו" מספירת לידות פעילות
               (146), שאינה מתיישבת עם 300 ו-148 — והמנהל ראה שישה כרטיסים
               נעלמים בלי הסבר. */
            rows={[
              { label: 'סך שנקנו', value: live.purchased > 0 ? fmt(live.purchased) : '—', tone: 'neutral' },
              { label: 'נמסרו', value: delivered == null ? '—' : fmt(delivered), tone: 'success' },
              { label: 'מלאי נותר', value: fmt(s.cardsRemaining), tone: s.cardsRemaining < 5 ? 'danger' : 'info' },
              { label: 'ממתינות לכרטיס', value: fmt(s.cardsPending), tone: s.cardsPending > 0 ? 'warning' : 'neutral' },
            ]}
          />
          )}

          {/* ⚠️ חלוקות חגים במקום אלמנות ויתומים: המחלקה הפעילה היא זו שצריכה
              להיות על הלוח. בשלב הרישום הנתון הקריטי הוא הצפי התקציבי — לפיו
              נקבע מה אפשר להתחייב, ולכן הוא מוצג ולא רק מספר הנרשמים. */}
          {can('distributions') && (
          <DeptCard
            title="חלוקות חגים"
            icon={<Gift size={20} />}
            href="/admin/distributions"
            accent="#a855f7"
            rows={s.holidayOpen ? [
              { label: 'נרשמו לחלוקה', value: fmt(s.holidayRegistered), tone: s.holidayRegistered > 0 ? 'success' : 'neutral' },
              { label: 'צפי תקציבי', value: fmtCur(s.holidayExpected), tone: 'info' },
              { label: 'החלוקה הפעילה', value: s.holidayName ?? '—', tone: 'neutral' },
            ] : [
              { label: 'רישום פתוח', value: 'אין', tone: 'warning' },
              { label: 'חלוקות בתכנון', value: fmt(s.distributionsPlanned), tone: 'neutral' },
            ]}
          />
          )}

          {can('financial_aid') && (
          <DeptCard
            title="סיוע רפואי"
            icon={<HandCoins size={20} />}
            href="/admin/financial-aid"
            accent="#14b8a6"
            rows={[
              { label: 'בקשות חדשות', value: fmt(s.aidPending), tone: s.aidPending > 0 ? 'warning' : 'neutral' },
              { label: 'נשלחו לאישור', value: fmt(s.aidAwaiting), tone: 'info' },
              { label: 'אושרו', value: fmt(s.aidApproved), tone: 'success' },
            ]}
          />
          )}

        </div>
      </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
        <CheckCircle2 size={13} className="text-emerald-500" />
        הנתונים מתעדכנים בזמן אמת
      </div>
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-600 text-white', text: 'text-indigo-600' },
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-600 text-white',   text: 'text-blue-600'   },
  amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-500 text-white',  text: 'text-amber-600'  },
  violet: { bg: 'bg-violet-50', icon: 'bg-violet-600 text-white', text: 'text-violet-600' },
}

function KpiCard({ label, value, sub, subPositive, subWarning, icon, color, href }: {
  label: string; value: string; sub: string
  subPositive?: boolean; subWarning?: boolean
  icon: React.ReactNode; color: string; href: string
}) {
  const c = colorMap[color] ?? colorMap.indigo
  return (
    <Link href={href}
      className={`group relative flex flex-col gap-3 rounded-2xl border border-slate-200/70 ${c.bg} p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-14px_rgba(15,23,42,0.18)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_18px_36px_-16px_rgba(79,70,229,0.3)] hover:-translate-y-0.5 transition-all duration-200`}>
      {/* המספר בולט למעלה; האייקון עובר לשורת התווית מתחתיו */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 ltr-num">{value}</p>
        </div>
        <ArrowUpRight size={15} className={`${c.text} opacity-0 group-hover:opacity-100 transition-opacity`} />
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.icon} shadow-sm flex-shrink-0`}>
          {icon}
        </span>
        <p className={`text-xs font-medium ${subWarning ? 'text-amber-600' : subPositive ? 'text-emerald-600' : 'text-slate-400'}`}>
          {sub}
        </p>
      </div>
    </Link>
  )
}

// ── Department Card ──────────────────────────────────────────────────────────

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const toneClass: Record<Tone, string> = {
  success: 'text-emerald-600 bg-emerald-50',
  warning: 'text-amber-600 bg-amber-50',
  danger:  'text-red-600 bg-red-50',
  info:    'text-blue-600 bg-blue-50',
  neutral: 'text-slate-500 bg-slate-50',
}

function DeptCard({ title, icon, href, accent, rows }: {
  title: string; icon: React.ReactNode; href: string
  accent: string
  rows: { label: string; value: string; tone: Tone }[]
}) {
  return (
    <Link href={href}
      className="group flex flex-col rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-14px_rgba(15,23,42,0.18)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.1),0_22px_44px_-18px_rgba(79,70,229,0.35)] hover:border-indigo-200 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: accent }}>
            {icon}
          </span>
          <h3 className="font-semibold text-slate-800 text-[15px]">{title}</h3>
        </div>
        <ArrowLeft size={15} className="text-slate-300 group-hover:text-slate-600 transition-colors" />
      </div>
      {/* Rows */}
      <div className="flex flex-col divide-y divide-slate-50 px-5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between py-3">
            <span className="text-[13px] text-slate-500">{r.label}</span>
            <span className={`text-sm font-bold ltr-num px-2.5 py-0.5 rounded-full ${toneClass[r.tone]}`}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </Link>
  )
}
