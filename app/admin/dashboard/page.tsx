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
import DashboardView from './DashboardView'

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

  // ── משתמש של מחלקה אחת — ישר אליה ─────────────────────────────────────
  //
  // 🔴 מי שהורשה למחלקה *אחת בלבד* נחת כאן על לוח בקרה ריק עם ההודעה
  // "לא הוגדרו לך מחלקות". מבחינתו זו תקלה: הוא קיבל גישה, ורואה מסך
  // שאומר שאין לו כלום. הפנייה ישירה למחלקה שלו הופכת את הכניסה
  // למה שהיא באמת — הוא נוחת בעבודה שלו.
  //
  // ⚠️ מנהל לעולם אינו מופנה: הוא רואה הכול, ולוח הבקרה הוא המסך שלו.
  // ⚠️ רק כשיש בדיוק אחת: שתיים ומעלה — הלוח הוא המקום הנכון לבחור.
  if (staff.role !== 'admin') {
    const HOME: Partial<Record<SectionKey, string>> = {
      book_fair:     '/admin/book-fair',
      kvitel:        '/admin/kvitel',
      gilyonot:      '/admin/gilyonot',
      beneficiaries: '/admin/beneficiaries',
      lineage:       '/admin/lineage',
      loans:         '/admin/loans',
      financial_aid: '/admin/financial-aid',
      distributions: '/admin/distributions',
      widows:        '/admin/widows',
      maternity:     '/admin/maternity/recovery',
      newsletter:    '/admin/newsletter',
      reports:       '/admin/reports',
    }
    const allowed = (Object.keys(HOME) as SectionKey[]).filter(can)
    if (allowed.length === 1) redirect(HOME[allowed[0]]!)
  }

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
    <>
      {/* 🔴 הדשבורד הוא Server Component ולכן היה קפוא עד ריענון ידני.
          מרענן כל 30 שניות, ומיד בחזרה ללשונית. עוצר כשהיא מוסתרת. */}
      <LiveRefresh seconds={30} />
      {!anyDept && <p style={{ padding: 24, textAlign: 'center' }}>לא הוגדרו לך מחלקות. פנה למנהל המערכת.</p>}
      <DashboardView
        greeting={getGreeting()}
        s={s}
        pendingTotal={pendingTotal}
        purchased={live.purchased}
        delivered={delivered}
        devMode={!isSupabaseConfigured()}
        // ⚠️ הרשאות מחושבות בשרת: לשונית בלי הרשאה אינה מרונדרת ואין לה נתונים בלקוח
        can={{
          beneficiaries: can('beneficiaries'), loans: can('loans'), maternity: can('maternity'),
          cards: can('maternity_cards'), aid: can('financial_aid'), distributions: can('distributions'),
          reports: can('reports'),
        }}
      />
    </>
  )
}
